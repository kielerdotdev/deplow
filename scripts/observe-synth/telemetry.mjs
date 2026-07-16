import { pick, weighted } from "./rng.mjs"
import { SERVICES, pickRelease, pickEnv, REGIONS } from "./catalog.mjs"
import { chDateTime64 } from "./traces.mjs"

export function buildOrphanLog(rng, projectId, t, tl) {
  const svc = pick(rng, SERVICES)
  const release = pickRelease(rng, tl)
  const level = weighted(rng, [
    ["INFO", 50],
    ["WARN", 20],
    ["DEBUG", 15],
    ["ERROR", 10],
    ["TRACE", 5],
  ])
  return {
    project_id: projectId,
    Timestamp: chDateTime64(t, 9),
    SeverityText: level,
    Body: `[${level}] ${pick(rng, [
      "cache warm complete",
      "gc pause 12ms",
      "config reloaded",
      "lease renewed",
      "metric flush ok",
      "autoscaler tick",
      "readyz ok",
    ])}`,
    ServiceName: svc.name,
    TraceId: "",
    SpanId: "",
    ResourceAttributes: {
      "service.name": svc.name,
      "service.version": release.version,
      "deployment.environment": pickEnv(rng),
    },
    LogAttributes: { "deplow.loadgen": "1", "deplow.scenario": "orphan" },
  }
}

export function buildMetricBatch(rng, projectId, t, tl) {
  const svc = pick(rng, SERVICES)
  const release = pickRelease(rng, tl)
  const env = pickEnv(rng)
  const common = {
    project_id: projectId,
    TimeUnix: chDateTime64(t, 3),
    ResourceAttributes: {
      "service.name": svc.name,
      "service.version": release.version,
      "deployment.environment": env,
      "cloud.region": pick(rng, REGIONS),
    },
    Attributes: {
      "host.name": `${svc.name}-${Math.floor(rng() * 4)}`,
      "deplow.loadgen": "1",
    },
  }
  const kind = Math.floor(rng() * 3)
  if (kind === 0) {
    return {
      kind: "gauge",
      row: {
        ...common,
        MetricName: pick(rng, [
          "process.runtime.nodejs.heap.used",
          "system.cpu.utilization",
          "http.server.active_requests",
          "queue.depth",
        ]),
        Value: +(rng() * 100 * tl.trafficMul).toFixed(4),
      },
    }
  }
  if (kind === 1) {
    return {
      kind: "sum",
      row: {
        ...common,
        MetricName: pick(rng, [
          "http.server.request.count",
          "db.client.operation.count",
          "messaging.publish.count",
          "http.client.request.count",
        ]),
        Value: Math.floor(rng() * 40 * tl.trafficMul) + 1,
      },
    }
  }
  const count = Math.floor(rng() * 80) + 10
  return {
    kind: "histogram",
    row: {
      ...common,
      MetricName: pick(rng, [
        "http.server.request.duration",
        "db.client.operation.duration",
        "http.client.request.duration",
      ]),
      Count: count,
      Sum: +(count * (5 + rng() * 200) * release.latencyMul * tl.latencyMul).toFixed(
        3,
      ),
    },
  }
}
