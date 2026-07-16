import type { ObserveClickHouseConfig } from "../clickhouse/client"
import { esc, queryJson, spanWhere, type SpanFilter } from "./common"

export type SeriesPoint = { t: number; v: number }

export type HeatCell = { x: number; y: number; v: number }

function bucketSeconds(from: Date, to: Date, buckets: number): number {
  const windowMs = Math.max(to.getTime() - from.getTime(), 1)
  return Math.max(Math.floor(windowMs / buckets / 1000), 1)
}

function parseBucket(bucket: string): number {
  if (bucket.includes("T")) return Date.parse(bucket)
  return Date.parse(bucket.replace(" ", "T") + "Z")
}

export async function rateSeries(
  config: ObserveClickHouseConfig,
  filter: SpanFilter,
  buckets = 48,
): Promise<SeriesPoint[]> {
  const where = spanWhere(filter)
  const sec = bucketSeconds(filter.from, filter.to, buckets)
  const rows = await queryJson<{ bucket: string; count: string }>(
    config,
    `
    SELECT
      toStartOfInterval(Timestamp, INTERVAL ${sec} SECOND) AS bucket,
      count() AS count
    FROM spans
    WHERE ${where}
    GROUP BY bucket
    ORDER BY bucket ASC
    `,
  )
  return rows.map((r) => ({
    t: parseBucket(r.bucket),
    v: Number(r.count) / sec,
  }))
}

export async function errorSeries(
  config: ObserveClickHouseConfig,
  filter: SpanFilter,
  buckets = 48,
): Promise<SeriesPoint[]> {
  const where = spanWhere(filter)
  const sec = bucketSeconds(filter.from, filter.to, buckets)
  const rows = await queryJson<{ bucket: string; count: string }>(
    config,
    `
    SELECT
      toStartOfInterval(Timestamp, INTERVAL ${sec} SECOND) AS bucket,
      countIf(StatusCode = 'STATUS_CODE_ERROR') AS count
    FROM spans
    WHERE ${where}
    GROUP BY bucket
    ORDER BY bucket ASC
    `,
  )
  return rows.map((r) => ({
    t: parseBucket(r.bucket),
    v: Number(r.count),
  }))
}

export async function durationSeries(
  config: ObserveClickHouseConfig,
  filter: SpanFilter,
  quantile = 0.95,
  buckets = 48,
): Promise<SeriesPoint[]> {
  const where = spanWhere(filter)
  const sec = bucketSeconds(filter.from, filter.to, buckets)
  const rows = await queryJson<{ bucket: string; q: string }>(
    config,
    `
    SELECT
      toStartOfInterval(Timestamp, INTERVAL ${sec} SECOND) AS bucket,
      quantile(${quantile})(Duration) AS q
    FROM spans
    WHERE ${where}
    GROUP BY bucket
    ORDER BY bucket ASC
    `,
  )
  return rows.map((r) => ({
    t: parseBucket(r.bucket),
    v: Number(r.q) / 1e6,
  }))
}

export async function countSeries(
  config: ObserveClickHouseConfig,
  filter: SpanFilter,
  buckets = 48,
): Promise<SeriesPoint[]> {
  const where = spanWhere(filter)
  const sec = bucketSeconds(filter.from, filter.to, buckets)
  const rows = await queryJson<{ bucket: string; count: string }>(
    config,
    `
    SELECT
      toStartOfInterval(Timestamp, INTERVAL ${sec} SECOND) AS bucket,
      count() AS count
    FROM spans
    WHERE ${where}
    GROUP BY bucket
    ORDER BY bucket ASC
    `,
  )
  return rows.map((r) => ({
    t: parseBucket(r.bucket),
    v: Number(r.count),
  }))
}

export type InsightMetric =
  | "rate"
  | "errors"
  | "duration_p50"
  | "duration_p95"
  | "duration_p99"
  | "count"

export type InsightGroupBy =
  | "service"
  | "operation"
  | "release"
  | "environment"
  | "status"

function groupByExpr(dim: InsightGroupBy): string {
  switch (dim) {
    case "service":
      return "ServiceName"
    case "operation":
      return "SpanName"
    case "release":
      return "coalesce(ResourceAttributes['service.version'], SpanAttributes['service.version'], '')"
    case "environment":
      return "coalesce(ResourceAttributes['deployment.environment'], SpanAttributes['deployment.environment'], '')"
    case "status":
      return "StatusCode"
  }
}

function metricAgg(metric: InsightMetric, sec: number): string {
  switch (metric) {
    case "rate":
      return `count() / ${sec}`
    case "errors":
      return `countIf(StatusCode = 'STATUS_CODE_ERROR')`
    case "duration_p50":
      return `quantile(0.5)(Duration) / 1000000`
    case "duration_p95":
      return `quantile(0.95)(Duration) / 1000000`
    case "duration_p99":
      return `quantile(0.99)(Duration) / 1000000`
    case "count":
      return `count()`
  }
}

export async function metricSeries(
  config: ObserveClickHouseConfig,
  filter: SpanFilter,
  metric: InsightMetric,
  buckets = 48,
): Promise<SeriesPoint[]> {
  if (metric === "rate") return rateSeries(config, filter, buckets)
  if (metric === "errors") return errorSeries(config, filter, buckets)
  if (metric === "count") return countSeries(config, filter, buckets)
  if (metric === "duration_p50") return durationSeries(config, filter, 0.5, buckets)
  if (metric === "duration_p99") return durationSeries(config, filter, 0.99, buckets)
  return durationSeries(config, filter, 0.95, buckets)
}

export type MultiSeriesResult = {
  keys: string[]
  rows: Array<{ t: number; label: string } & Record<string, number>>
}

/** Top-N grouped time series for dashboard widgets. */
export async function seriesGrouped(
  config: ObserveClickHouseConfig,
  filter: SpanFilter,
  metric: InsightMetric,
  groupBy: InsightGroupBy,
  opts?: { buckets?: number; topN?: number },
): Promise<MultiSeriesResult> {
  const buckets = opts?.buckets ?? 48
  const topN = opts?.topN ?? 8
  const where = spanWhere(filter)
  const sec = bucketSeconds(filter.from, filter.to, buckets)
  const dim = groupByExpr(groupBy)
  const agg = metricAgg(metric, sec)

  const topKeys = await queryJson<{ key: string; weight: string }>(
    config,
    `
    SELECT ${dim} AS key, count() AS weight
    FROM spans
    WHERE ${where} AND ${dim} != ''
    GROUP BY key
    ORDER BY weight DESC
    LIMIT ${topN}
    `,
  )
  const keys = topKeys.map((r) => r.key).filter(Boolean)
  if (keys.length === 0) {
    return { keys: [], rows: [] }
  }

  const keyList = keys.map((k) => `'${esc(k)}'`).join(", ")
  const rows = await queryJson<{ bucket: string; key: string; v: string }>(
    config,
    `
    SELECT
      toStartOfInterval(Timestamp, INTERVAL ${sec} SECOND) AS bucket,
      ${dim} AS key,
      ${agg} AS v
    FROM spans
    WHERE ${where} AND ${dim} IN (${keyList})
    GROUP BY bucket, key
    ORDER BY bucket ASC
    `,
  )

  const byT = new Map<number, Record<string, number>>()
  for (const r of rows) {
    const t = parseBucket(r.bucket)
    const cur = byT.get(t) ?? {}
    cur[r.key] = Number(r.v)
    byT.set(t, cur)
  }
  const sortedTs = [...byT.keys()].sort((a, b) => a - b)
  return {
    keys,
    rows: sortedTs.map((t) => {
      const vals = byT.get(t) ?? {}
      const row = {
        t,
        label: new Date(t).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        ...Object.fromEntries(keys.map((k) => [k, vals[k] ?? 0])),
      } as { t: number; label: string } & Record<string, number>
      return row
    }),
  }
}

export async function numberValue(
  config: ObserveClickHouseConfig,
  filter: SpanFilter,
  metric: InsightMetric,
): Promise<number> {
  const where = spanWhere(filter)
  const windowSec = Math.max(
    (filter.to.getTime() - filter.from.getTime()) / 1000,
    1,
  )
  let expr: string
  switch (metric) {
    case "rate":
      expr = `count() / ${windowSec}`
      break
    case "errors":
      expr = `countIf(StatusCode = 'STATUS_CODE_ERROR')`
      break
    case "duration_p50":
      expr = `quantile(0.5)(Duration) / 1000000`
      break
    case "duration_p95":
      expr = `quantile(0.95)(Duration) / 1000000`
      break
    case "duration_p99":
      expr = `quantile(0.99)(Duration) / 1000000`
      break
    case "count":
      expr = `count()`
      break
  }
  const rows = await queryJson<{ v: string }>(
    config,
    `SELECT ${expr} AS v FROM spans WHERE ${where}`,
  )
  return Number(rows[0]?.v ?? 0)
}

export type GroupTableRow = { key: string; value: number }

export async function groupTable(
  config: ObserveClickHouseConfig,
  filter: SpanFilter,
  metric: InsightMetric,
  groupBy: InsightGroupBy,
  limit = 20,
): Promise<GroupTableRow[]> {
  const where = spanWhere(filter)
  const windowSec = Math.max(
    (filter.to.getTime() - filter.from.getTime()) / 1000,
    1,
  )
  const dim = groupByExpr(groupBy)
  const agg = metricAgg(metric, windowSec)
  const rows = await queryJson<{ key: string; v: string }>(
    config,
    `
    SELECT ${dim} AS key, ${agg} AS v
    FROM spans
    WHERE ${where} AND ${dim} != ''
    GROUP BY key
    ORDER BY v DESC
    LIMIT ${limit}
    `,
  )
  return rows.map((r) => ({ key: r.key, value: Number(r.v) }))
}

/** time × duration heatmap for Explore */
export async function durationHeatmap(
  config: ObserveClickHouseConfig,
  filter: SpanFilter,
  opts?: { timeBuckets?: number; durationBuckets?: number; maxDurationMs?: number },
): Promise<HeatCell[]> {
  const timeBuckets = opts?.timeBuckets ?? 24
  const durationBuckets = opts?.durationBuckets ?? 16
  const maxDurationMs = opts?.maxDurationMs ?? 10_000
  const where = spanWhere(filter)
  const sec = bucketSeconds(filter.from, filter.to, timeBuckets)
  const binMs = maxDurationMs / durationBuckets
  const rows = await queryJson<{
    xb: string
    yb: string
    count: string
  }>(
    config,
    `
    SELECT
      toStartOfInterval(Timestamp, INTERVAL ${sec} SECOND) AS xb,
      least(
        ${durationBuckets - 1},
        toUInt32(floor((Duration / 1000000) / ${binMs}))
      ) AS yb,
      count() AS count
    FROM spans
    WHERE ${where}
    GROUP BY xb, yb
    ORDER BY xb, yb
    `,
  )
  return rows.map((r) => ({
    x: parseBucket(r.xb),
    y: Number(r.yb) * binMs,
    v: Number(r.count),
  }))
}

export type AnomalyCard = {
  key: string
  value: string
  selected_count: number
  baseline_count: number
  selected_share: number
  baseline_share: number
  lift: number
}

/**
 * Attribute distribution lift: selected cohort vs baseline.
 * Language: "associated with," never "root cause."
 */
export async function attributeAnomalies(
  config: ObserveClickHouseConfig,
  selected: SpanFilter,
  baseline: SpanFilter,
  attributeKeys: string[] = [
    "http.route",
    "http.method",
    "http.status_code",
    "db.system",
    "net.peer.name",
    "service.version",
    "deployment.environment",
  ],
  limit = 20,
): Promise<{ anomalies: AnomalyCard[]; sampled: boolean }> {
  const anomalies: AnomalyCard[] = []
  let sampled = false

  for (const key of attributeKeys) {
    const selWhere = spanWhere(selected)
    const baseWhere = spanWhere(baseline)
    const [selRows, baseRows, selTotalRows, baseTotalRows] = await Promise.all([
      queryJson<{ value: string; count: string }>(
        config,
        `
        SELECT coalesce(SpanAttributes['${key}'], ResourceAttributes['${key}']) AS value, count() AS count
        FROM spans
        WHERE ${selWhere}
          AND coalesce(SpanAttributes['${key}'], ResourceAttributes['${key}']) != ''
        GROUP BY value
        ORDER BY count DESC
        LIMIT 50
        `,
      ),
      queryJson<{ value: string; count: string }>(
        config,
        `
        SELECT coalesce(SpanAttributes['${key}'], ResourceAttributes['${key}']) AS value, count() AS count
        FROM spans
        WHERE ${baseWhere}
          AND coalesce(SpanAttributes['${key}'], ResourceAttributes['${key}']) != ''
        GROUP BY value
        ORDER BY count DESC
        LIMIT 50
        `,
      ),
      queryJson<{ c: string }>(
        config,
        `SELECT count() AS c FROM spans WHERE ${selWhere}`,
      ),
      queryJson<{ c: string }>(
        config,
        `SELECT count() AS c FROM spans WHERE ${baseWhere}`,
      ),
    ])
    const selTotal = Number(selTotalRows[0]?.c ?? 0)
    const baseTotal = Number(baseTotalRows[0]?.c ?? 0)
    if (selTotal > 50_000 || baseTotal > 50_000) sampled = true
    if (selTotal === 0) continue

    const baseMap = new Map(
      baseRows.map((r) => [r.value, Number(r.count)] as const),
    )
    for (const r of selRows) {
      const selectedCount = Number(r.count)
      const baselineCount = baseMap.get(r.value) ?? 0
      const selectedShare = selectedCount / selTotal
      const baselineShare = baseTotal > 0 ? baselineCount / baseTotal : 0
      const lift =
        baselineShare > 0
          ? selectedShare / baselineShare
          : selectedShare > 0
            ? 99
            : 0
      if (lift < 1.5 && baselineShare > 0) continue
      anomalies.push({
        key,
        value: r.value,
        selected_count: selectedCount,
        baseline_count: baselineCount,
        selected_share: selectedShare,
        baseline_share: baselineShare,
        lift,
      })
    }
  }

  anomalies.sort((a, b) => b.lift - a.lift)
  return { anomalies: anomalies.slice(0, limit), sampled }
}

export async function selectionCounts(
  config: ObserveClickHouseConfig,
  selected: SpanFilter,
  baseline: SpanFilter | null,
): Promise<{ selected: number; baseline: number | null }> {
  const sel = await queryJson<{ c: string }>(
    config,
    `SELECT count() AS c FROM spans WHERE ${spanWhere(selected)}`,
  )
  let baselineCount: number | null = null
  if (baseline) {
    const base = await queryJson<{ c: string }>(
      config,
      `SELECT count() AS c FROM spans WHERE ${spanWhere(baseline)}`,
    )
    baselineCount = Number(base[0]?.c ?? 0)
  }
  return { selected: Number(sel[0]?.c ?? 0), baseline: baselineCount }
}
