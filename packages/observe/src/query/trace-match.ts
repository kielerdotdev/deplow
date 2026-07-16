/**
 * Trace relationship queries (SigNoz-style A → B matching).
 *
 * Patterns:
 * - same_trace: traces containing both A and B span patterns
 * - descendant: A is an ancestor of B (same trace, A.Timestamp <= B, A span is ancestor)
 * - child: B's ParentSpanId equals A's SpanId
 * - exclude: traces matching A but not B
 */
import type { ObserveClickHouseConfig } from "../clickhouse/client"
import { esc, iso, queryJson, spanWhere, type SpanFilter } from "./common"
import type { TraceListItem } from "./traces"

export type TraceMatchRelation =
  | "same_trace"
  | "descendant"
  | "child"
  | "exclude"

export type TraceMatchPattern = {
  service?: string
  operation?: string
  statusError?: boolean
  attributeFilters?: SpanFilter["attributeFilters"]
}

function patternWhere(
  projectId: string,
  from: Date,
  to: Date,
  pattern: TraceMatchPattern,
  alias: string,
): string {
  const parts = [
    `${alias}.project_id = '${esc(projectId)}'`,
    `${alias}.Timestamp >= parseDateTime64BestEffort('${iso(from)}', 9)`,
    `${alias}.Timestamp < parseDateTime64BestEffort('${iso(to)}', 9)`,
  ]
  if (pattern.service)
    parts.push(`${alias}.ServiceName = '${esc(pattern.service)}'`)
  if (pattern.operation)
    parts.push(`${alias}.SpanName = '${esc(pattern.operation)}'`)
  if (pattern.statusError)
    parts.push(`${alias}.StatusCode = 'STATUS_CODE_ERROR'`)
  for (const af of pattern.attributeFilters ?? []) {
    const attr = `coalesce(${alias}.SpanAttributes['${esc(af.key)}'], ${alias}.ResourceAttributes['${esc(af.key)}'])`
    switch (af.op) {
      case "eq":
        parts.push(`${attr} = '${esc(af.value ?? "")}'`)
        break
      case "contains":
        parts.push(
          `positionCaseInsensitive(${attr}, '${esc(af.value ?? "")}') > 0`,
        )
        break
      case "exists":
        parts.push(`${attr} != ''`)
        break
      default:
        break
    }
  }
  return parts.join(" AND ")
}

export async function listTracesByMatch(
  config: ObserveClickHouseConfig,
  opts: {
    projectId: string
    from: Date
    to: Date
    patternA: TraceMatchPattern
    patternB: TraceMatchPattern
    relation: TraceMatchRelation
    limit?: number
  },
): Promise<TraceListItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const aWhere = patternWhere(
    opts.projectId,
    opts.from,
    opts.to,
    opts.patternA,
    "a",
  )
  const bWhere = patternWhere(
    opts.projectId,
    opts.from,
    opts.to,
    opts.patternB,
    "b",
  )

  let joinSql: string
  if (opts.relation === "same_trace") {
    joinSql = `
      SELECT DISTINCT a.TraceId AS trace_id
      FROM spans AS a
      INNER JOIN spans AS b ON a.TraceId = b.TraceId
      WHERE ${aWhere} AND ${bWhere}
      LIMIT ${limit}
    `
  } else if (opts.relation === "child") {
    joinSql = `
      SELECT DISTINCT a.TraceId AS trace_id
      FROM spans AS a
      INNER JOIN spans AS b
        ON a.TraceId = b.TraceId AND b.ParentSpanId = a.SpanId
      WHERE ${aWhere} AND ${bWhere}
      LIMIT ${limit}
    `
  } else if (opts.relation === "descendant") {
    // Approximate descendant: same trace, A starts at/before B, A is not B
    joinSql = `
      SELECT DISTINCT a.TraceId AS trace_id
      FROM spans AS a
      INNER JOIN spans AS b
        ON a.TraceId = b.TraceId
        AND a.SpanId != b.SpanId
        AND a.Timestamp <= b.Timestamp
      WHERE ${aWhere} AND ${bWhere}
      LIMIT ${limit}
    `
  } else {
    // exclude: A without B
    joinSql = `
      SELECT DISTINCT a.TraceId AS trace_id
      FROM spans AS a
      WHERE ${aWhere}
        AND a.TraceId NOT IN (
          SELECT DISTINCT b.TraceId FROM spans AS b WHERE ${bWhere}
        )
      LIMIT ${limit}
    `
  }

  const ids = await queryJson<{ trace_id: string }>(config, joinSql)
  if (!ids.length) return []

  const idList = ids.map((r) => `'${esc(r.trace_id)}'`).join(", ")
  const base = spanWhere({
    projectId: opts.projectId,
    from: opts.from,
    to: opts.to,
    spanScope: "all",
  })

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
    WHERE ${base} AND TraceId IN (${idList})
    GROUP BY TraceId
    ORDER BY start DESC
    LIMIT ${limit}
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
