/**
 * Observe synthetic data — scenario-driven generator (Sentry ingest-load-tester
 * + PostHog demo-seed style).
 *
 * Usage:
 *   pnpm observe:load -- --project-id <uuid> [options]
 *   node scripts/observe-synth/index.mjs --project-id <uuid>
 *
 * Prior art:
 *   - getsentry/ingest-load-tester (weighted task factories, span trees, events)
 *   - PostHog DemoHog / posthog-demo-3000 (personas, historical seed, artifacts)
 */

import { setTimeout as sleep } from "node:timers/promises"
import { parseArgs, resolveConfig, printBanner } from "./cli.mjs"
import { mulberry32 } from "./rng.mjs"
import { pingClickHouse, insertJson } from "./ch.mjs"
import { sampleTime, timelineAt } from "./timeline.mjs"
import { pickScenario, SCENARIOS } from "./scenarios.mjs"
import { buildTrace } from "./traces.mjs"
import { buildOrphanLog, buildMetricBatch } from "./telemetry.mjs"
import { postSentryError, ERROR_GROUPS } from "./sentry.mjs"

const args = parseArgs(process.argv.slice(2))

if (args.help || args.h) {
  console.log(`Usage: node scripts/observe-synth/index.mjs --project-id <uuid> [options]

Options:
  --project-id      Deplow project UUID (or OBSERVE_PROJECT_ID)
  --dsn             Sentry DSN for Issues (or OBSERVE_DSN)
  --base-url        App origin (default http://localhost:3000)
  --hours           Backfill window hours (default 24)
  --traces          Root traces (default 8000)
  --logs            Log target (default 14000)
  --errors          Sentry error events (default 500)
  --metrics         Metric points (default 6000)
  --batch           Insert batch size (default 500)
  --seed            RNG seed
  --continuous      Keep streaming after backfill
  --interval-ms     Live tick interval (default 2000)
  --dry-run         Build sample in memory; print scenario mix (no ClickHouse)
`)
  process.exit(0)
}

const cfg = resolveConfig(args)

if (args["dry-run"]) {
  const rng = mulberry32(cfg.seed)
  const now = Date.now()
  const from = now - cfg.hours * 3600_000
  const counts = Object.fromEntries(SCENARIOS.map((s) => [s.id, 0]))
  let spans = 0
  let logs = 0
  const n = Math.min(cfg.traces, 2000)
  for (let i = 0; i < n; i++) {
    const t = sampleTime(rng, from, now)
    const tl = timelineAt(t, from, now)
    const scenario = pickScenario(rng, tl)
    counts[scenario.id]++
    const built = buildTrace(rng, cfg.projectId || "00000000-0000-0000-0000-000000000000", scenario, t)
    spans += built.spans.length
    logs += built.logs.length
  }
  console.log(`dry-run ${n} traces → ${spans} spans, ${logs} logs`)
  console.log(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  ${k.padEnd(16)} ${v}`)
      .join("\n"),
  )
  process.exit(0)
}

if (!cfg.projectId) {
  console.error("Missing --project-id (Deplow project UUID).")
  process.exit(1)
}

const rng = mulberry32(cfg.seed)
printBanner(cfg)

await pingClickHouse(cfg)

const totals = { spans: 0, logs: 0, metrics: 0, errors: 0, batches: 0, scenarios: {} }

if (!cfg.continuous) {
  await backfill()
  printSummary("backfill complete")
} else {
  await backfill()
  printSummary("initial backfill complete — streaming…")
  for (;;) {
    const tick = await emitLiveBurst()
    totals.spans += tick.spans
    totals.logs += tick.logs
    totals.metrics += tick.metrics
    totals.errors += tick.errors
    process.stdout.write(
      `\r  live +${tick.spans} spans +${tick.logs} logs +${tick.metrics} metrics +${tick.errors} errors | total spans ${totals.spans}   `,
    )
    await sleep(cfg.intervalMs)
  }
}

async function backfill() {
  const now = Date.now()
  const from = now - cfg.hours * 3600_000
  const spanBuf = []
  const logBuf = []

  let tracesMade = 0
  while (tracesMade < cfg.traces) {
    const t = sampleTime(rng, from, now)
    const tl = timelineAt(t, from, now)
    const scenario = pickScenario(rng, tl)
    totals.scenarios[scenario.id] = (totals.scenarios[scenario.id] ?? 0) + 1

    const { spans, logs } = buildTrace(rng, cfg.projectId, scenario, t)
    spanBuf.push(...spans)
    logBuf.push(...logs)
    tracesMade++

    if (spanBuf.length >= cfg.batch) {
      totals.spans += await insertJson(cfg, "spans", spanBuf.splice(0, cfg.batch))
      totals.batches++
    }
    if (logBuf.length >= cfg.batch) {
      totals.logs += await insertJson(cfg, "logs", logBuf.splice(0, cfg.batch))
    }
  }
  if (spanBuf.length) totals.spans += await insertJson(cfg, "spans", spanBuf)
  if (logBuf.length) totals.logs += await insertJson(cfg, "logs", logBuf)

  // Orphan / ops noise logs
  const extra = []
  for (let i = 0; i < Math.max(0, cfg.logs - totals.logs); i++) {
    const t = sampleTime(rng, from, now)
    extra.push(buildOrphanLog(rng, cfg.projectId, t, timelineAt(t, from, now)))
    if (extra.length >= cfg.batch) {
      totals.logs += await insertJson(cfg, "logs", extra.splice(0, cfg.batch))
    }
  }
  if (extra.length) totals.logs += await insertJson(cfg, "logs", extra)

  // Metrics along the same timeline
  const gauges = []
  const sums = []
  const hists = []
  for (let i = 0; i < cfg.metrics; i++) {
    const t = sampleTime(rng, from, now)
    const row = buildMetricBatch(rng, cfg.projectId, t, timelineAt(t, from, now))
    if (row.kind === "gauge") gauges.push(row.row)
    else if (row.kind === "sum") sums.push(row.row)
    else hists.push(row.row)
    for (const [table, buf] of [
      ["metrics_gauge", gauges],
      ["metrics_sum", sums],
      ["metrics_histogram", hists],
    ]) {
      if (buf.length >= cfg.batch) {
        totals.metrics += await insertJson(cfg, table, buf.splice(0, cfg.batch))
      }
    }
  }
  for (const [table, buf] of [
    ["metrics_gauge", gauges],
    ["metrics_sum", sums],
    ["metrics_histogram", hists],
  ]) {
    if (buf.length) totals.metrics += await insertJson(cfg, table, buf)
  }

  // Sentry Issues — stable fingerprints (PostHog-style artifact volume)
  if (cfg.dsn) {
    const parsed = parseDsn(cfg.dsn)
    let failLogged = false
    // Distribute across known error groups for good Issues UX
    for (let i = 0; i < cfg.errors; i++) {
      const t = sampleTime(rng, from, now)
      const tl = timelineAt(t, from, now)
      const group = pickErrorGroup(rng, tl)
      const ok = await postSentryError(rng, {
        baseUrl: cfg.baseUrl,
        dsn: cfg.dsn,
        parsed,
        t,
        group,
        tl,
        idx: i,
      })
      if (ok) totals.errors++
      else if (!failLogged) {
        console.warn(
          "  warn: Sentry envelope ingest failed (Observe enabled + web up?). Continuing.",
        )
        failLogged = true
      }
      if (i % 40 === 0) await sleep(15)
    }
  } else {
    console.warn("  warn: no --dsn — skipping Sentry Issues seed")
  }
}

async function emitLiveBurst() {
  const now = Date.now()
  const from = now - 60_000
  const spans = []
  const logs = []
  const n = 12 + Math.floor(rng() * 28)
  for (let i = 0; i < n; i++) {
    const t = now - Math.floor(rng() * 8_000)
    const tl = timelineAt(t, from, now)
    const scenario = pickScenario(rng, { ...tl, live: true })
    const built = buildTrace(rng, cfg.projectId, scenario, t)
    spans.push(...built.spans)
    logs.push(...built.logs)
  }
  const metrics = []
  for (let i = 0; i < 20; i++) {
    const row = buildMetricBatch(rng, cfg.projectId, now, timelineAt(now, from, now))
    if (row.kind === "sum") metrics.push(row.row)
  }
  let errors = 0
  if (cfg.dsn && rng() < 0.4) {
    const parsed = parseDsn(cfg.dsn)
    const tl = timelineAt(now, from, now)
    if (
      await postSentryError(rng, {
        baseUrl: cfg.baseUrl,
        dsn: cfg.dsn,
        parsed,
        t: now,
        group: pickErrorGroup(rng, tl),
        tl,
        idx: Math.floor(rng() * 1e6),
      })
    ) {
      errors++
    }
  }
  return {
    spans: await insertJson(cfg, "spans", spans),
    logs: await insertJson(cfg, "logs", logs),
    metrics: await insertJson(cfg, "metrics_sum", metrics),
    errors,
  }
}

function pickErrorGroup(rng, tl) {
  // Bias toward payment/timeout groups during storms
  if (tl.errorStorm) {
    return ERROR_GROUPS.find((g) => g.id === "timeout") ?? ERROR_GROUPS[0]
  }
  if (tl.regression) {
    return ERROR_GROUPS.find((g) => g.id === "payment") ?? ERROR_GROUPS[0]
  }
  const total = ERROR_GROUPS.reduce((s, g) => s + g.weight, 0)
  let r = rng() * total
  for (const g of ERROR_GROUPS) {
    r -= g.weight
    if (r <= 0) return g
  }
  return ERROR_GROUPS[ERROR_GROUPS.length - 1]
}

function parseDsn(dsn) {
  const u = new URL(dsn)
  return { publicKey: u.username, sentryId: u.pathname.replace(/^\//, "") }
}

function printSummary(label) {
  const top = Object.entries(totals.scenarios)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `${k}=${v}`)
    .join(" · ")
  console.log(`\n${label}
  spans:     ${totals.spans}
  logs:      ${totals.logs}
  metrics:   ${totals.metrics}
  errors:    ${totals.errors}
  batches:   ${totals.batches}
  scenarios: ${top}

Try in Observe / Trends:
  - Series A = rate (spans), B = error_rate → formula C = B/A*100
  - Breakdown by service / operation / release
  - Filter tenant.id = acme · Compare previous period
  - Exclude health / synthetic (healthcheck scenario)
  - Explore → mid-window slow band (release 1.3.0 regression)
  - Issues → ${ERROR_GROUPS.map((g) => g.type).join(" / ")}
`)
}
