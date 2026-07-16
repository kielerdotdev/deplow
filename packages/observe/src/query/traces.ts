import type { ObserveClickHouseConfig } from "../clickhouse/client"
import { esc, queryJson, spanWhere, type SpanFilter } from "./common"

export type TraceListItem = {
  trace_id: string
  service: string
  root_name: string
  start: string
  duration_ms: number
  span_count: number
  error_count: number
  status: string
}

export type SpanRow = {
  trace_id: string
  span_id: string
  parent_span_id: string
  service: string
  name: string
  kind: string
  start: string
  duration_ns: number
  duration_ms: number
  status: string
  status_message: string
  attributes: Record<string, string>
  resource: Record<string, string>
}

export async function listTraces(
  config: ObserveClickHouseConfig,
  filter: SpanFilter,
  limit = 50,
): Promise<TraceListItem[]> {
  const where = spanWhere(filter)
  const rows = await queryJson<{
    trace_id: string
    service: string
    root_name: string
    start: string
    duration_ns: string
    span_count: string
    error_count: string
    status: string
  }>(
    config,
    `
    SELECT
      TraceId AS trace_id,
      argMin(ServiceName, Timestamp) AS service,
      argMin(SpanName, Timestamp) AS root_name,
      min(Timestamp) AS start,
      max(toUnixTimestamp64Nano(Timestamp) + toUInt64(Duration))
        - min(toUnixTimestamp64Nano(Timestamp)) AS duration_ns,
      count() AS span_count,
      countIf(StatusCode = 'STATUS_CODE_ERROR') AS error_count,
      if(countIf(StatusCode = 'STATUS_CODE_ERROR') > 0, 'error', 'ok') AS status
    FROM spans
    WHERE ${where}
    GROUP BY TraceId
    ORDER BY start DESC
    LIMIT ${Math.min(Math.max(limit, 1), 200)}
    `,
  )
  return rows.map((r) => ({
    trace_id: r.trace_id,
    service: r.service,
    root_name: r.root_name,
    start: r.start,
    duration_ms: Number(r.duration_ns) / 1e6,
    span_count: Number(r.span_count),
    error_count: Number(r.error_count),
    status: r.status,
  }))
}

export async function getTrace(
  config: ObserveClickHouseConfig,
  projectId: string,
  traceId: string,
): Promise<SpanRow[]> {
  const rows = await queryJson<{
    TraceId: string
    SpanId: string
    ParentSpanId: string
    ServiceName: string
    SpanName: string
    SpanKind: string
    Timestamp: string
    Duration: string
    StatusCode: string
    StatusMessage: string
    SpanAttributes: Record<string, string>
    ResourceAttributes: Record<string, string>
  }>(
    config,
    `
    SELECT
      TraceId, SpanId, ParentSpanId, ServiceName, SpanName, SpanKind,
      Timestamp, Duration, StatusCode, StatusMessage,
      SpanAttributes, ResourceAttributes
    FROM spans
    WHERE project_id = '${esc(projectId)}' AND TraceId = '${esc(traceId)}'
    ORDER BY Timestamp ASC
    LIMIT 5000
    `,
  )
  return rows.map((r) => ({
    trace_id: r.TraceId,
    span_id: r.SpanId,
    parent_span_id: r.ParentSpanId,
    service: r.ServiceName,
    name: r.SpanName,
    kind: r.SpanKind,
    start: r.Timestamp,
    duration_ns: Number(r.Duration),
    duration_ms: Number(r.Duration) / 1e6,
    status: r.StatusCode,
    status_message: r.StatusMessage,
    attributes: r.SpanAttributes ?? {},
    resource: r.ResourceAttributes ?? {},
  }))
}

export async function recentErrorTraces(
  config: ObserveClickHouseConfig,
  filter: SpanFilter,
  limit = 10,
): Promise<TraceListItem[]> {
  return listTraces(
    config,
    { ...filter, statusError: true },
    limit,
  )
}

/** Trace count over time (one point per bucket by root span start). */
export async function tracesHistogram(
  config: ObserveClickHouseConfig,
  filter: SpanFilter,
  bucketSeconds = 300,
): Promise<Array<{ t: number; count: number; error_count: number }>> {
  const where = spanWhere(filter)
  const rows = await queryJson<{
    t: string
    count: string
    error_count: string
  }>(
    config,
    `
    SELECT
      toUnixTimestamp(
        toStartOfInterval(min_ts, INTERVAL ${Math.max(bucketSeconds, 60)} SECOND)
      ) * 1000 AS t,
      count() AS count,
      countIf(has_error > 0) AS error_count
    FROM (
      SELECT
        TraceId,
        min(Timestamp) AS min_ts,
        countIf(StatusCode = 'STATUS_CODE_ERROR') AS has_error
      FROM spans
      WHERE ${where}
      GROUP BY TraceId
    )
    GROUP BY t
    ORDER BY t ASC
    `,
  )
  return rows.map((r) => ({
    t: Number(r.t),
    count: Number(r.count),
    error_count: Number(r.error_count),
  }))
}
