import type { ObserveClickHouseConfig } from "../clickhouse/client"
import { esc, iso, queryJson, spanWhere, type SpanFilter } from "./common"
import { trendsFieldExpr, type TrendsSignal } from "./trends-run"

export type FacetBucket = {
  value: string
  count: number
}

export type FacetResult = {
  field: string
  buckets: FacetBucket[]
  otherCount: number
}

const DEFAULT_TRACE_FACETS = [
  "service",
  "environment",
  "operation",
  "status",
  "http.method",
  "http.route",
  "http.status_code",
  "host.name",
]

const DEFAULT_LOG_FACETS = ["service", "severity", "environment"]

/**
 * Dynamic facet counts for Explorer sidebars.
 * Uses the same SpanFilter / field expressions as the main query.
 */
export async function facetCounts(
  config: ObserveClickHouseConfig,
  opts: {
    projectId: string
    from: Date
    to: Date
    signal?: "spans" | "logs" | "root_spans"
    fields?: string[]
    spanFilter?: SpanFilter
    limitPerFacet?: number
  },
): Promise<FacetResult[]> {
  const signal: TrendsSignal =
    opts.signal === "logs"
      ? "logs"
      : opts.signal === "root_spans"
        ? "root_spans"
        : "spans"
  const table = signal === "logs" ? "logs" : "spans"
  const fields =
    opts.fields ??
    (signal === "logs" ? DEFAULT_LOG_FACETS : DEFAULT_TRACE_FACETS)
  const limit = opts.limitPerFacet ?? 12

  const baseWhere = opts.spanFilter
    ? spanWhere(opts.spanFilter)
    : [
        `project_id = '${esc(opts.projectId)}'`,
        `Timestamp >= parseDateTime64BestEffort('${iso(opts.from)}', 9)`,
        `Timestamp < parseDateTime64BestEffort('${iso(opts.to)}', 9)`,
        signal === "root_spans"
          ? `(ParentSpanId = '' OR ParentSpanId IS NULL)`
          : null,
      ]
        .filter(Boolean)
        .join(" AND ")

  const results: FacetResult[] = []
  for (const field of fields) {
    const expr = trendsFieldExpr(signal, field)
    try {
      const rows = await queryJson<{ value: string; c: string }>(
        config,
        `
        SELECT toString(${expr}) AS value, count() AS c
        FROM ${table}
        WHERE ${baseWhere}
          AND toString(${expr}) != ''
        GROUP BY value
        ORDER BY c DESC
        LIMIT ${limit + 1}
        `,
      )
      const buckets = rows.slice(0, limit).map((r) => ({
        value: r.value,
        count: Number(r.c),
      }))
      const otherCount =
        rows.length > limit ? Number(rows[limit]?.c ?? 0) : 0
      results.push({ field, buckets, otherCount })
    } catch {
      results.push({ field, buckets: [], otherCount: 0 })
    }
  }
  return results
}
