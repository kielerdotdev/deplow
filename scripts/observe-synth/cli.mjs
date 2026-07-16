export function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("--")) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith("--")) out[key] = true
    else {
      out[key] = next
      i++
    }
  }
  return out
}

export function num(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function resolveConfig(args) {
  const projectId = args["project-id"] || process.env.OBSERVE_PROJECT_ID
  const dsn = args.dsn || process.env.OBSERVE_DSN || ""
  const baseUrl = (
    args["base-url"] ||
    process.env.BASE_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "")
  const chDb =
    args["ch-db"] || process.env.DEPLOW_CLICKHOUSE_DATABASE || "deplow_observe"
  return {
    projectId,
    dsn,
    baseUrl,
    chDb,
    chUrl: resolveClickHouseUrl(args),
    hours: num(args.hours, 24),
    traces: num(args.traces, 8_000),
    logs: num(args.logs, 14_000),
    errors: num(args.errors, 500),
    metrics: num(args.metrics, 6_000),
    batch: num(args.batch, 500),
    continuous: Boolean(args.continuous),
    intervalMs: num(args["interval-ms"], 2000),
    seed: num(args.seed, Date.now() % 1e9),
  }
}

function resolveClickHouseUrl(a) {
  if (a["ch-url"]) return a["ch-url"]
  if (process.env.DEPLOW_CLICKHOUSE_URL) {
    const base = process.env.DEPLOW_CLICKHOUSE_URL.replace(/\/$/, "")
    const user = process.env.DEPLOW_CLICKHOUSE_USER || "deplow"
    const pass = process.env.DEPLOW_CLICKHOUSE_PASSWORD || "deplow"
    if (base.includes("@")) return base
    return base.replace(/^https?:\/\//, (m) => `${m}${user}:${pass}@`)
  }
  return "http://deplow:deplow@127.0.0.1:8123"
}

export function printBanner(cfg) {
  console.log(`Observe synth (Sentry/PostHog-style scenarios)
  project:     ${cfg.projectId}
  clickhouse:  ${maskUrl(cfg.chUrl)} / ${cfg.chDb}
  dsn:         ${cfg.dsn ? maskDsn(cfg.dsn) : "(skipped — no --dsn)"}
  window:      ${cfg.hours}h backfill
  targets:     traces≈${cfg.traces} logs≈${cfg.logs} metrics≈${cfg.metrics} errors≈${cfg.errors}
  seed:        ${cfg.seed}
  continuous:  ${cfg.continuous}
`)
}

function maskUrl(u) {
  try {
    const x = new URL(u)
    if (x.password) x.password = "***"
    return x.toString()
  } catch {
    return u
  }
}

function maskDsn(dsn) {
  try {
    const u = new URL(dsn)
    u.username = `${u.username.slice(0, 4)}…`
    return u.toString()
  } catch {
    return "(invalid dsn)"
  }
}
