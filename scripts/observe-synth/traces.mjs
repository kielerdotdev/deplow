import { hex, logNormal, pick, weighted } from "./rng.mjs"
import { DB_SYSTEMS, PEERS, SERVICES } from "./catalog.mjs"

const STATUS_OK = [
  [200, 72],
  [201, 8],
  [204, 5],
  [304, 3],
]
const STATUS_ERR = [
  [400, 12],
  [401, 8],
  [404, 10],
  [429, 8],
  [500, 35],
  [502, 15],
  [503, 12],
]

/**
 * Build a multi-hop span tree (Sentry spangen / transaction generator style).
 */
export function buildTrace(rng, projectId, scenario, startMs) {
  const traceId = hex(16)
  const spans = []
  const logs = []
  const root = scenario.root
  const rootSpanId = hex(8)

  const isHealth =
    scenario.id === "healthcheck" ||
    (scenario.synthetic && rng() < 0.7)
  const route = isHealth
    ? pick(rng, ["GET /health", "GET /readyz", "GET /live"])
    : pick(rng, root.routes)

  const errChance =
    (scenario.forceError ? 0.85 : 0.04) *
    scenario.release.errorMul *
    scenario.tl.errorMul
  const isError = rng() < Math.min(0.95, errChance)
  const status = isError
    ? weighted(rng, STATUS_ERR)
    : weighted(rng, STATUS_OK)

  const rootDur = duration(rng, scenario, scenario.medianMs)
  spans.push(
    makeSpan(rng, {
      projectId,
      traceId,
      spanId: rootSpanId,
      parentSpanId: "",
      service: root,
      name: route,
      kind: root.kind === "worker" ? "SPAN_KIND_CONSUMER" : "SPAN_KIND_SERVER",
      startMs,
      durationMs: rootDur,
      statusError: isError,
      scenario,
      attrs: {
        "http.route": stripMethod(route),
        "http.method": methodOf(route),
        "http.status_code": String(status),
        "http.response.status_code": String(status),
        "user.tier": scenario.tier,
        "tenant.id": scenario.tenant,
        "messaging.system": root.kind === "worker" ? "redis" : undefined,
        "graphql.operation.name":
          scenario.id === "graphql"
            ? pick(rng, ["Product", "Cart", "Checkout"])
            : undefined,
      },
    }),
  )

  // Middleware / router child
  if (scenario.depth >= 2 && !isHealth) {
    const midId = hex(8)
    const midDur = rootDur * (0.85 + rng() * 0.1)
    spans.push(
      makeSpan(rng, {
        projectId,
        traceId,
        spanId: midId,
        parentSpanId: rootSpanId,
        service: root,
        name: "middleware.auth",
        kind: "SPAN_KIND_INTERNAL",
        startMs: startMs + 1,
        durationMs: Math.min(midDur, 8 + rng() * 20),
        statusError: false,
        scenario,
        attrs: { "code.function": "requireAuth" },
      }),
    )
  }

  let parent = rootSpanId
  let cursor = startMs + 3 + rng() * 8

  // DB hop
  if (scenario.depth >= 2 && rng() < (scenario.id === "cache_stampede" ? 0.95 : 0.8)) {
    const db = scenario.id === "cache_stampede" ? "redis" : pick(rng, DB_SYSTEMS)
    const dbDur = duration(rng, scenario, db === "redis" ? 3 : 18, {
      stampede: scenario.id === "cache_stampede",
    })
    const dbId = hex(8)
    const dbErr = isError && rng() < 0.35
    spans.push(
      makeSpan(rng, {
        projectId,
        traceId,
        spanId: dbId,
        parentSpanId: parent,
        service: root,
        name: `${db}.query`,
        kind: "SPAN_KIND_CLIENT",
        startMs: cursor,
        durationMs: dbDur,
        statusError: dbErr,
        scenario,
        attrs: {
          "db.system": db,
          "db.operation": pick(rng, ["SELECT", "INSERT", "UPDATE", "GET", "SET"]),
          "db.name": pick(rng, ["orders", "catalog", "users", "payments", "sessions"]),
          "db.statement":
            db === "redis"
              ? "MGET checkout:session:*"
              : "SELECT * FROM orders WHERE id = $1",
          "net.peer.name": `${db}.internal`,
        },
      }),
    )
    cursor += dbDur * 0.4
  }

  // External HTTP
  if (
    scenario.depth >= 3 &&
    (scenario.id === "checkout" ||
      scenario.id === "payment_fail" ||
      rng() < 0.5)
  ) {
    const peer =
      scenario.id === "payment_fail" || scenario.id === "checkout"
        ? "api.stripe.com"
        : pick(rng, PEERS)
    const extDur = duration(rng, scenario, 80)
    const extErr =
      peer.includes("stripe") && (scenario.forceError || scenario.tl.regression)
        ? rng() < 0.55
        : rng() < 0.04
    spans.push(
      makeSpan(rng, {
        projectId,
        traceId,
        spanId: hex(8),
        parentSpanId: parent,
        service: root,
        name: `HTTP POST`,
        kind: "SPAN_KIND_CLIENT",
        startMs: cursor,
        durationMs: extDur,
        statusError: extErr,
        scenario,
        attrs: {
          "http.method": "POST",
          "http.status_code": String(extErr ? 502 : 200),
          "net.peer.name": peer,
          "server.address": peer,
          "http.url": `https://${peer}/v1/${pick(rng, ["charge", "ship", "hook", "send"])}`,
        },
      }),
    )
    cursor += extDur * 0.3
  }

  // Downstream service hop(s)
  const hops = Math.min(scenario.depth - 2, 3)
  for (let h = 0; h < hops; h++) {
    if (rng() > 0.7 && h > 0) break
    const down = pick(
      rng,
      SERVICES.filter((s) => s.name !== root.name),
    )
    const downDur = duration(rng, scenario, 40 + h * 15)
    const downId = hex(8)
    const downRoute = pick(rng, down.routes)
    spans.push(
      makeSpan(rng, {
        projectId,
        traceId,
        spanId: downId,
        parentSpanId: parent,
        service: down,
        name: downRoute,
        kind: "SPAN_KIND_SERVER",
        startMs: cursor,
        durationMs: downDur,
        statusError: isError && rng() < 0.45,
        scenario,
        attrs: {
          "http.route": stripMethod(downRoute),
          "http.method": methodOf(downRoute),
          "http.status_code": String(isError ? 500 : 200),
          "rpc.service": down.name,
          "tenant.id": scenario.tenant,
        },
      }),
    )
    // Nested DB under downstream
    if (rng() < 0.6) {
      const db = pick(rng, DB_SYSTEMS)
      spans.push(
        makeSpan(rng, {
          projectId,
          traceId,
          spanId: hex(8),
          parentSpanId: downId,
          service: down,
          name: `${db}.query`,
          kind: "SPAN_KIND_CLIENT",
          startMs: cursor + 2,
          durationMs: duration(rng, scenario, 12),
          statusError: false,
          scenario,
          attrs: {
            "db.system": db,
            "db.operation": "SELECT",
            "db.name": "catalog",
          },
        }),
      )
    }
    parent = downId
    cursor += downDur * 0.35
  }

  // Correlated logs
  const logN = isHealth ? 0 : 1 + Math.floor(rng() * (isError ? 5 : 3))
  for (let i = 0; i < logN; i++) {
    const level = isError && i === 0 ? "ERROR" : weighted(rng, [
      ["INFO", 55],
      ["WARN", 22],
      ["ERROR", 12],
      ["DEBUG", 9],
      ["TRACE", 2],
    ])
    const span = spans[Math.min(i, spans.length - 1)]
    logs.push({
      project_id: projectId,
      Timestamp: chDateTime64(startMs + i * 4, 9),
      SeverityText: level,
      Body: logBody(rng, level, root, route, scenario, isError),
      ServiceName: span.ServiceName,
      TraceId: traceId,
      SpanId: span.SpanId,
      ResourceAttributes: resourceAttrs(scenario, span.ServiceName, root.lang),
      LogAttributes: {
        "tenant.id": scenario.tenant,
        "http.route": stripMethod(route),
        "code.function": pick(rng, ["handle", "middleware", "handler", "worker"]),
        "hostrig.scenario": scenario.id,
      },
    })
  }

  return { spans, logs }
}

function duration(rng, scenario, medianMs, opts = {}) {
  let ms = logNormal(rng, medianMs, opts.stampede ? 0.9 : 0.5)
  ms *= scenario.release.latencyMul * scenario.tl.latencyMul
  if (scenario.tl.slowBand && rng() < 0.45) ms *= 8 + rng() * 20
  if (rng() < 0.02) ms *= 50 + rng() * 80 // extreme outlier
  return Math.max(0.5, ms)
}

function makeSpan(
  rng,
  {
    projectId,
    traceId,
    spanId,
    parentSpanId,
    service,
    name,
    kind,
    startMs,
    durationMs: dur,
    statusError,
    scenario,
    attrs,
  },
) {
  const cleanAttrs = Object.fromEntries(
    Object.entries(attrs).filter(([, v]) => v !== undefined),
  )
  return {
    project_id: projectId,
    Timestamp: chDateTime64(startMs, 9),
    TraceId: traceId,
    SpanId: spanId,
    ParentSpanId: parentSpanId,
    TraceState: "",
    SpanName: name,
    SpanKind: kind,
    ServiceName: typeof service === "string" ? service : service.name,
    ResourceAttributes: resourceAttrs(
      scenario,
      typeof service === "string" ? service : service.name,
      typeof service === "string" ? "nodejs" : service.lang,
    ),
    SpanAttributes: {
      ...cleanAttrs,
      "hostrig.loadgen": "1",
      "hostrig.scenario": scenario.id,
      "deployment.release": scenario.release.version,
      ...(scenario.synthetic
        ? { "http.route": cleanAttrs["http.route"] || "/health" }
        : {}),
    },
    Duration: Math.max(1, Math.floor(dur * 1e6)),
    StatusCode: statusError ? "STATUS_CODE_ERROR" : "STATUS_CODE_OK",
    StatusMessage: statusError
      ? pick(rng, [
          "upstream timeout",
          "connection reset",
          "null pointer",
          "payment declined",
          "deadline exceeded",
          "circuit open",
        ])
      : "",
  }
}

function resourceAttrs(scenario, serviceName, lang) {
  return {
    "service.name": serviceName,
    "service.version": scenario.release.version,
    "deployment.environment": scenario.env,
    "cloud.region": scenario.region,
      "host.name": `${serviceName}-0`,
    "telemetry.sdk.language": lang || "nodejs",
  }
}

function stripMethod(route) {
  return route.replace(/^[A-Z]+ /, "").replace(/^process\./, "")
}

function methodOf(route) {
  const m = route.match(/^([A-Z]+)\s/)
  return m ? m[1] : "POST"
}

function logBody(rng, level, service, route, scenario, isError) {
  if (isError || level === "ERROR") {
    return pick(rng, [
      `failed ${route} for tenant=${scenario.tenant}: upstream timeout`,
      `Unhandled error in ${service.name}: payment provider 502`,
      `panic recovered: cannot read property 'id' of undefined`,
      `checkout confirm failed release=${scenario.release.version}`,
      `circuit open for inventory (tenant=${scenario.tenant})`,
    ])
  }
  if (level === "WARN") {
    return pick(rng, [
      `slow ${route}: p95 rising under release ${scenario.release.version}`,
      `retrying ${pick(rng, PEERS)} (attempt 2)`,
      `cache miss stampede sku=${Math.floor(rng() * 9000)}`,
    ])
  }
  return pick(rng, [
    `handled ${route}`,
    `auth ok tenant=${scenario.tenant} tier=${scenario.tier}`,
    `cache hit sku=${Math.floor(rng() * 9000)}`,
    `enqueued job process.order.paid`,
  ])
}

export function chDateTime64(ms, precision) {
  const d = new Date(ms)
  const iso = d.toISOString().replace("T", " ").replace("Z", "")
  if (precision <= 3) return iso
  const frac = String(Math.floor((ms % 1000) * 1e6)).padStart(9, "0")
  return `${iso.split(".")[0]}.${frac.slice(0, precision)}`
}
