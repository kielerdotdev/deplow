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
  "http.method",
  "http.route",
  "http.status_code",
  "host.name",
]

type CacheEntry<T> = { expires: number; value: T }

const fieldCache = new Map<string, CacheEntry<unknown>>()
const DEFAULT_TTL_MS = 60_000

function cacheGet<T>(key: string): T | null {
  const hit = fieldCache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expires) {
    fieldCache.delete(key)
    return null
  }
  return hit.value as T
}

function cacheSet<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  fieldCache.set(key, { expires: Date.now() + ttlMs, value })
  // Soft cap
  if (fieldCache.size > 500) {
    const first = fieldCache.keys().next().value
    if (first) fieldCache.delete(first)
  }
}

/** Test helper / admin: clear suggestion cache. */
export function clearFieldSuggestCache(): void {
  fieldCache.clear()
}

/**
 * Suggest filter/breakdown fields and values from ClickHouse (map keys + known dims).
 * Results are TTL-cached per project/signal/window to keep autocomplete snappy.
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
  const signal = opts.signal ?? "spans"
  const limit = opts.limit ?? 40
  const q = (opts.q ?? "").trim().toLowerCase()
  // Cache unfiltered catalog; filter q in-memory
  const cacheKey = `fields:${opts.projectId}:${signal}:${opts.from.toISOString()}:${opts.to.toISOString()}`
  type Payload = {
    fields: Array<{ key: string; kind: "known" | "attr"; count: number }>
  }
  let payload = cacheGet<Payload>(cacheKey)
  if (!payload) {
    const table = signal === "logs" ? "logs" : "spans"
    const attrCol = signal === "logs" ? "LogAttributes" : "SpanAttributes"
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
      LIMIT ${limit * 3}
      `,
    )

    const known = KNOWN_FIELDS.map((k) => ({
      key: k,
      kind: "known" as const,
      count: 0,
    }))
    const attrs = rows.map((r) => ({
      key: r.key,
      kind: "attr" as const,
      count: Number(r.c),
    }))

    const seen = new Set<string>()
    const fields: Payload["fields"] = []
    for (const f of [...known, ...attrs]) {
      if (!f.key || seen.has(f.key)) continue
      seen.add(f.key)
      fields.push(f)
    }
    payload = { fields }
    cacheSet(cacheKey, payload)
  }

  const filtered = payload.fields.filter(
    (f) => !q || f.key.toLowerCase().includes(q),
  )
  return { fields: filtered.slice(0, limit) }
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
  const signal = opts.signal ?? "spans"
  const limit = opts.limit ?? 25
  const q = (opts.q ?? "").trim().toLowerCase()
  const cacheKey = `values:${opts.projectId}:${signal}:${opts.field}:${opts.from.toISOString()}:${opts.to.toISOString()}`
  type Payload = { values: Array<{ value: string; count: number }> }
  let payload = cacheGet<Payload>(cacheKey)
  if (!payload) {
    const table = signal === "logs" ? "logs" : "spans"
    const attrCol = signal === "logs" ? "LogAttributes" : "SpanAttributes"
    const resCol = "ResourceAttributes"
    const where = [
      `project_id = '${esc(opts.projectId)}'`,
      `Timestamp >= parseDateTime64BestEffort('${iso(opts.from)}', 9)`,
      `Timestamp < parseDateTime64BestEffort('${iso(opts.to)}', 9)`,
    ]

    const f = opts.field.trim()
    let expr: string
    if (f === "service") expr = "ServiceName"
    else if (f === "operation" || f === "name")
      expr = signal === "logs" ? "Body" : "SpanName"
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

    where.push(`toString(${expr}) != ''`)

    const rows = await queryJson<{ value: string; c: string }>(
      config,
      `
      SELECT toString(${expr}) AS value, count() AS c
      FROM ${table}
      WHERE ${where.join(" AND ")}
      GROUP BY value
      ORDER BY c DESC
      LIMIT ${Math.max(limit * 4, 100)}
      `,
    )
    payload = {
      values: rows.map((r) => ({ value: r.value, count: Number(r.c) })),
    }
    cacheSet(cacheKey, payload, 45_000)
  }

  const filtered = q
    ? payload.values.filter((v) => v.value.toLowerCase().includes(q))
    : payload.values
  return { values: filtered.slice(0, limit) }
}
