import type { ObserveClickHouseConfig } from "../clickhouse/client"
import { esc, iso, queryJson } from "./common"

const KNOWN_FIELDS = [
  "service",
  "operation",
  "release",
  "environment",
  "status",
  "severity",
  "body",
  "name",
  "duration",
  "duration_ms",
]

/**
 * Suggest filter/breakdown fields and values from ClickHouse (map keys + known dims).
 */
export async function suggestFields(
  config: ObserveClickHouseConfig,
  opts: {
    projectId: string
    from: Date
    to: Date
    signal?: "spans" | "logs"
    /** Prefix filter on field name */
    q?: string
    limit?: number
  },
): Promise<{ fields: Array<{ key: string; kind: "known" | "attr"; count: number }> }> {
  const table = opts.signal === "logs" ? "logs" : "spans"
  const attrCol = opts.signal === "logs" ? "LogAttributes" : "SpanAttributes"
  const limit = opts.limit ?? 40
  const where = [
    `project_id = '${esc(opts.projectId)}'`,
    `Timestamp >= parseDateTime64BestEffort('${iso(opts.from)}', 9)`,
    `Timestamp < parseDateTime64BestEffort('${iso(opts.to)}', 9)`,
  ].join(" AND ")

  const rows = await queryJson<{ key: string; c: string }>(
    config,
    `
    SELECT arrayJoin(mapKeys(${attrCol})) AS key, count() AS c
    FROM ${table}
    WHERE ${where}
    GROUP BY key
    ORDER BY c DESC
    LIMIT ${limit * 2}
    `,
  )

  const q = (opts.q ?? "").trim().toLowerCase()
  const known = KNOWN_FIELDS.filter((k) => !q || k.includes(q)).map((k) => ({
    key: k,
    kind: "known" as const,
    count: 0,
  }))
  const attrs = rows
    .map((r) => ({
      key: r.key.startsWith("attr:") ? r.key : r.key,
      kind: "attr" as const,
      count: Number(r.c),
    }))
    .filter((r) => r.key && (!q || r.key.toLowerCase().includes(q)))

  const seen = new Set<string>()
  const fields: Array<{ key: string; kind: "known" | "attr"; count: number }> =
    []
  for (const f of [...known, ...attrs]) {
    if (seen.has(f.key)) continue
    seen.add(f.key)
    fields.push(f)
    if (fields.length >= limit) break
  }
  return { fields }
}

export async function suggestFieldValues(
  config: ObserveClickHouseConfig,
  opts: {
    projectId: string
    from: Date
    to: Date
    field: string
    signal?: "spans" | "logs"
    q?: string
    limit?: number
  },
): Promise<{ values: Array<{ value: string; count: number }> }> {
  const table = opts.signal === "logs" ? "logs" : "spans"
  const attrCol = opts.signal === "logs" ? "LogAttributes" : "SpanAttributes"
  const resCol = "ResourceAttributes"
  const limit = opts.limit ?? 25
  const where = [
    `project_id = '${esc(opts.projectId)}'`,
    `Timestamp >= parseDateTime64BestEffort('${iso(opts.from)}', 9)`,
    `Timestamp < parseDateTime64BestEffort('${iso(opts.to)}', 9)`,
  ]

  const f = opts.field.trim()
  let expr: string
  if (f === "service") expr = "ServiceName"
  else if (f === "operation" || f === "name")
    expr = opts.signal === "logs" ? "Body" : "SpanName"
  else if (f === "status") expr = "StatusCode"
  else if (f === "severity") expr = "SeverityText"
  else if (f === "release")
    expr = `coalesce(${resCol}['service.version'], ${attrCol}['service.version'], '')`
  else if (f === "environment")
    expr = `coalesce(${resCol}['deployment.environment'], ${attrCol}['deployment.environment'], '')`
  else {
    const key = f.startsWith("attr:") ? f.slice(5) : f
    expr = `coalesce(${attrCol}['${esc(key)}'], ${resCol}['${esc(key)}'], '')`
  }

  if (opts.q?.trim()) {
    where.push(
      `positionCaseInsensitive(toString(${expr}), '${esc(opts.q.trim())}') > 0`,
    )
  }
  where.push(`toString(${expr}) != ''`)

  const rows = await queryJson<{ value: string; c: string }>(
    config,
    `
    SELECT toString(${expr}) AS value, count() AS c
    FROM ${table}
    WHERE ${where.join(" AND ")}
    GROUP BY value
    ORDER BY c DESC
    LIMIT ${limit}
    `,
  )
  return {
    values: rows.map((r) => ({ value: r.value, count: Number(r.c) })),
  }
}
