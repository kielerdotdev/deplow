import type { ObserveClickHouseConfig } from "../clickhouse/client"
import { esc, iso, queryJson, safeAttrKey } from "./common"

export type LogFilter = {
  projectId: string
  from: Date
  to: Date
  service?: string
  traceId?: string
  spanId?: string
  severity?: string
  environment?: string
  q?: string
  limit?: number
  offset?: number
  /** Attribute filters against LogAttributes / ResourceAttributes */
  attributeFilters?: Array<{
    key: string
    op:
      | "eq"
      | "neq"
      | "contains"
      | "not_contains"
      | "exists"
      | "not_exists"
      | "gt"
      | "gte"
      | "lt"
      | "lte"
    value?: string
  }>
}

export function logWhere(f: LogFilter): string {
  const parts = [
    `project_id = '${esc(f.projectId)}'`,
    `Timestamp >= parseDateTime64BestEffort('${iso(f.from)}', 9)`,
    `Timestamp < parseDateTime64BestEffort('${iso(f.to)}', 9)`,
  ]
  if (f.service) parts.push(`ServiceName = '${esc(f.service)}'`)
  if (f.traceId) parts.push(`TraceId = '${esc(f.traceId)}'`)
  if (f.spanId) parts.push(`SpanId = '${esc(f.spanId)}'`)
  if (f.severity) parts.push(`SeverityText = '${esc(f.severity)}'`)
  if (f.environment) {
    parts.push(
      `(ResourceAttributes['deployment.environment'] = '${esc(f.environment)}' OR LogAttributes['deployment.environment'] = '${esc(f.environment)}')`,
    )
  }
  if (f.q) parts.push(`positionCaseInsensitive(Body, '${esc(f.q)}') > 0`)
  for (const af of f.attributeFilters ?? []) {
    const key = safeAttrKey(af.key)
    const attr = `coalesce(LogAttributes['${esc(key)}'], ResourceAttributes['${esc(key)}'])`
    switch (af.op) {
      case "eq":
        parts.push(`${attr} = '${esc(af.value ?? "")}'`)
        break
      case "neq":
        parts.push(`${attr} != '${esc(af.value ?? "")}'`)
        break
      case "contains":
        parts.push(
          `positionCaseInsensitive(${attr}, '${esc(af.value ?? "")}') > 0`,
        )
        break
      case "not_contains":
        parts.push(
          `positionCaseInsensitive(${attr}, '${esc(af.value ?? "")}') = 0`,
        )
        break
      case "exists":
        parts.push(`${attr} != ''`)
        break
      case "not_exists":
        parts.push(`${attr} = ''`)
        break
      case "gt":
        parts.push(`toFloat64OrZero(${attr}) > ${Number(af.value) || 0}`)
        break
      case "gte":
        parts.push(`toFloat64OrZero(${attr}) >= ${Number(af.value) || 0}`)
        break
      case "lt":
        parts.push(`toFloat64OrZero(${attr}) < ${Number(af.value) || 0}`)
        break
      case "lte":
        parts.push(`toFloat64OrZero(${attr}) <= ${Number(af.value) || 0}`)
        break
    }
  }
  return parts.join(" AND ")
}

export type LogRow = {
  timestamp: string
  severity: string
  body: string
  service: string
  trace_id: string
  span_id: string
  attributes: Record<string, string>
}

export async function searchLogs(
  config: ObserveClickHouseConfig,
  filter: LogFilter,
): Promise<LogRow[]> {
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500)
  const offset = Math.max(filter.offset ?? 0, 0)
  const where = logWhere(filter)
  const rows = await queryJson<{
    Timestamp: string
    SeverityText: string
    Body: string
    ServiceName: string
    TraceId: string
    SpanId: string
    LogAttributes: Record<string, string>
  }>(
    config,
    `
    SELECT Timestamp, SeverityText, Body, ServiceName, TraceId, SpanId, LogAttributes
    FROM logs
    WHERE ${where}
    ORDER BY Timestamp DESC
    LIMIT ${limit} OFFSET ${offset}
    `,
  )
  return rows.map((r) => ({
    timestamp: r.Timestamp,
    severity: r.SeverityText,
    body: r.Body,
    service: r.ServiceName,
    trace_id: r.TraceId,
    span_id: r.SpanId,
    attributes: r.LogAttributes ?? {},
  }))
}

export async function logsHistogram(
  config: ObserveClickHouseConfig,
  filter: LogFilter,
  buckets = 48,
): Promise<Array<{ t: number; count: number }>> {
  const where = logWhere(filter)
  const windowMs = Math.max(filter.to.getTime() - filter.from.getTime(), 1)
  const bucketSec = Math.max(Math.floor(windowMs / buckets / 1000), 1)
  const rows = await queryJson<{ bucket: string; count: string }>(
    config,
    `
    SELECT
      toStartOfInterval(Timestamp, INTERVAL ${bucketSec} SECOND) AS bucket,
      count() AS count
    FROM logs
    WHERE ${where}
    GROUP BY bucket
    ORDER BY bucket ASC
    `,
  )
  return rows.map((r) => ({
    t: Date.parse(
      r.bucket.includes("T") ? r.bucket : r.bucket.replace(" ", "T") + "Z",
    ),
    count: Number(r.count),
  }))
}
