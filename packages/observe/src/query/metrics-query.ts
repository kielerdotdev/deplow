import type { ObserveClickHouseConfig } from "../clickhouse/client"
import { esc, iso, queryJson } from "./common"
import { resolveIntervalSec, type TrendsInterval } from "./trends-run"

export type MetricCatalogItem = {
  name: string
  kind: "gauge" | "sum" | "histogram" | "summary" | "exp_histogram"
  samples: number
  lastSeen: string
}

export type MetricsSeriesResult = {
  from: string
  to: string
  intervalSec: number
  seriesMeta: Array<{ key: string; label: string }>
  points: Array<{ t: number; values: Record<string, number | null> }>
}

const TABLES: Array<{ table: string; kind: MetricCatalogItem["kind"] }> = [
  { table: "metrics_gauge", kind: "gauge" },
  { table: "metrics_sum", kind: "sum" },
  { table: "metrics_histogram", kind: "histogram" },
  { table: "metrics_summary", kind: "summary" },
  { table: "metrics_exp_histogram", kind: "exp_histogram" },
]

export async function listMetrics(
  config: ObserveClickHouseConfig,
  projectId: string,
  limit = 100,
): Promise<MetricCatalogItem[]> {
  const parts: MetricCatalogItem[] = []
  for (const { table, kind } of TABLES) {
    try {
      const rows = await queryJson<{
        name: string
        samples: string
        last_seen: string
      }>(
        config,
        `
        SELECT
          MetricName AS name,
          count() AS samples,
          max(TimeUnix) AS last_seen
        FROM ${table}
        WHERE project_id = '${esc(projectId)}'
        GROUP BY MetricName
        ORDER BY samples DESC
        LIMIT ${limit}
        `,
      )
      for (const r of rows) {
        parts.push({
          name: r.name,
          kind,
          samples: Number(r.samples),
          lastSeen: r.last_seen,
        })
      }
    } catch {
      // Table may be empty / missing in older envs
    }
  }
  parts.sort((a, b) => b.samples - a.samples)
  return parts.slice(0, limit)
}

function tableForMetric(
  kindHint?: MetricCatalogItem["kind"],
): string {
  if (kindHint === "sum") return "metrics_sum"
  if (kindHint === "histogram") return "metrics_histogram"
  if (kindHint === "summary") return "metrics_summary"
  if (kindHint === "exp_histogram") return "metrics_exp_histogram"
  return "metrics_gauge"
}

function temporalExpr(
  temporalAgg: "avg" | "sum" | "min" | "max" | "rate" | "increase",
  valueCol: string,
  intervalSec: number,
): string {
  switch (temporalAgg) {
    case "sum":
      return `sum(${valueCol})`
    case "min":
      return `min(${valueCol})`
    case "max":
      return `max(${valueCol})`
    case "rate":
    case "increase":
      return `sum(${valueCol}) / ${intervalSec}`
    default:
      return `avg(${valueCol})`
  }
}

export async function runMetricsSeries(
  config: ObserveClickHouseConfig,
  opts: {
    projectId: string
    metricName: string
    from: Date
    to: Date
    temporalAgg: "avg" | "sum" | "min" | "max" | "rate" | "increase"
    spatialAgg: "avg" | "sum" | "min" | "max"
    groupBy?: string[]
    interval?: TrendsInterval
    kindHint?: MetricCatalogItem["kind"]
  },
): Promise<MetricsSeriesResult> {
  const intervalSec = resolveIntervalSec(
    opts.interval ?? "auto",
    opts.from,
    opts.to,
  )
  const table = tableForMetric(opts.kindHint)
  const valueCol =
    table === "metrics_histogram" ||
    table === "metrics_summary" ||
    table === "metrics_exp_histogram"
      ? "Sum"
      : "Value"

  const groupField = opts.groupBy?.[0]
  const groupExpr = groupField
    ? `coalesce(Attributes['${esc(groupField)}'], ResourceAttributes['${esc(groupField)}'], '')`
    : `''`

  const temporal = temporalExpr(opts.temporalAgg, valueCol, intervalSec)
  const spatial =
    opts.spatialAgg === "sum"
      ? `sum(v)`
      : opts.spatialAgg === "min"
        ? `min(v)`
        : opts.spatialAgg === "max"
          ? `max(v)`
          : `avg(v)`

  const rows = await queryJson<{
    bucket: string
    dim: string
    v: string
  }>(
    config,
    `
    SELECT
      bucket,
      dim,
      ${spatial} AS v
    FROM (
      SELECT
        toStartOfInterval(TimeUnix, INTERVAL ${intervalSec} SECOND) AS bucket,
        ${groupExpr} AS dim,
        ${temporal} AS v
      FROM ${table}
      WHERE project_id = '${esc(opts.projectId)}'
        AND MetricName = '${esc(opts.metricName)}'
        AND TimeUnix >= parseDateTime64BestEffort('${iso(opts.from)}', 3)
        AND TimeUnix < parseDateTime64BestEffort('${iso(opts.to)}', 3)
      GROUP BY bucket, dim
    )
    GROUP BY bucket, dim
    ORDER BY bucket ASC
    LIMIT 5000
    `,
  )

  const dims = new Set<string>()
  const byT = new Map<number, Record<string, number | null>>()
  for (const r of rows) {
    const t = Date.parse(
      r.bucket.includes("T") ? r.bucket : r.bucket.replace(" ", "T") + "Z",
    )
    const key = r.dim || "all"
    dims.add(key)
    const slot = byT.get(t) ?? {}
    slot[key] = Number(r.v)
    byT.set(t, slot)
  }

  const points = [...byT.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, values]) => ({ t, values }))

  return {
    from: opts.from.toISOString(),
    to: opts.to.toISOString(),
    intervalSec,
    seriesMeta: [...dims].map((d) => ({ key: d, label: d })),
    points,
  }
}
