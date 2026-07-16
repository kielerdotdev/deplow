import type { ObserveClickHouseConfig } from "../clickhouse/client"
import { esc, iso, queryJson } from "./common"

export type ReleaseRow = {
  release: string
  first_seen: string
  last_seen: string
  span_count: number
  error_count: number
}

export async function listReleases(
  config: ObserveClickHouseConfig,
  projectId: string,
  from: Date,
  to: Date,
): Promise<ReleaseRow[]> {
  const rows = await queryJson<{
    release: string
    first_seen: string
    last_seen: string
    span_count: string
    error_count: string
  }>(
    config,
    `
    SELECT
      coalesce(
        nullIf(ResourceAttributes['service.version'], ''),
        nullIf(SpanAttributes['service.version'], ''),
        'unknown'
      ) AS release,
      min(Timestamp) AS first_seen,
      max(Timestamp) AS last_seen,
      count() AS span_count,
      countIf(StatusCode = 'STATUS_CODE_ERROR') AS error_count
    FROM spans
    WHERE project_id = '${esc(projectId)}'
      AND Timestamp >= parseDateTime64BestEffort('${iso(from)}', 9)
      AND Timestamp < parseDateTime64BestEffort('${iso(to)}', 9)
    GROUP BY release
    ORDER BY last_seen DESC
    LIMIT 100
    `,
  )
  return rows.map((r) => ({
    release: r.release,
    first_seen: r.first_seen,
    last_seen: r.last_seen,
    span_count: Number(r.span_count),
    error_count: Number(r.error_count),
  }))
}
