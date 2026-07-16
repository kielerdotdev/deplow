import type { ObserveClickHouseConfig } from "../clickhouse/client"
import { esc, iso, queryJson, type SpanFilter } from "./common"

export type InsightSource = "spans" | "logs"
export type InsightKind = "line" | "bar" | "area" | "number" | "table"

export type InsightMeasure =
  | { type: "count" }
  | { type: "rate" }
  | { type: "errors" }
  | { type: "duration_quantile"; quantile: number }
  | { type: "uniq"; field: string }
  | { type: "avg_attr"; field: string }
  | { type: "sum_attr"; field: string }
  | {
      type: "count_if"
      field: string
      op: "eq" | "neq" | "contains" | "exists" | "not_exists" | "gt" | "gte" | "lt" | "lte"
      value?: string
    }

export type InsightFilter = {
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
}

export type InsightSpecRun = {
  source: InsightSource
  kind: InsightKind
  measure: InsightMeasure
  filters?: InsightFilter[]
  breakdown?: { field: string; topN?: number }
  display?: {
    stacked?: boolean
    fill?: boolean
    unit?: string
    label?: string
  }
  rawSql?: string
}

export type InsightRunResult =
  | { kind: "number"; value: number; unit?: string }
  | {
      kind: "series"
      chartKind: "line" | "bar" | "area"
      series: Array<{ t: number; v: number }>
      unit?: string
    }
  | {
      kind: "multi"
      chartKind: "line" | "bar" | "area"
      keys: string[]
      rows: Array<{ t: number; label: string } & Record<string, number>>
      unit?: string
      stacked?: boolean
    }
  | {
      kind: "table"
      rows: Array<{ key: string; value: number }>
      groupBy: string
      unit?: string
    }

function bucketSeconds(from: Date, to: Date, buckets: number): number {
  const windowMs = Math.max(to.getTime() - from.getTime(), 1)
  return Math.max(Math.floor(windowMs / buckets / 1000), 1)
}

function parseBucket(bucket: string): number {
  if (bucket.includes("T")) return Date.parse(bucket)
  return Date.parse(bucket.replace(" ", "T") + "Z")
}

function attrMap(source: InsightSource): string {
  return source === "logs" ? "LogAttributes" : "SpanAttributes"
}

function resourceMap(_source: InsightSource): string {
  return "ResourceAttributes"
}

/** Resolve a UI field name to a ClickHouse expression. */
export function fieldExpr(source: InsightSource, field: string): string {
  const f = field.trim()
  const attrKey = f.startsWith("attr:") ? f.slice(5) : null
  const known: Record<string, string> = {
    service: "ServiceName",
    operation: "SpanName",
    name: source === "logs" ? "Body" : "SpanName",
    release: `coalesce(${resourceMap(source)}['service.version'], ${attrMap(source)}['service.version'], '')`,
    environment: `coalesce(${resourceMap(source)}['deployment.environment'], ${attrMap(source)}['deployment.environment'], '')`,
    status: "StatusCode",
    severity: "SeverityText",
    body: "Body",
  }
  if (attrKey) {
    return `coalesce(${attrMap(source)}['${esc(attrKey)}'], ${resourceMap(source)}['${esc(attrKey)}'], '')`
  }
  if (known[f]) return known[f]!
  // bare attribute key
  return `coalesce(${attrMap(source)}['${esc(f)}'], ${resourceMap(source)}['${esc(f)}'], '')`
}

function filterClause(source: InsightSource, f: InsightFilter): string | null {
  const expr = fieldExpr(source, f.key)
  switch (f.op) {
    case "eq":
      return f.value !== undefined ? `${expr} = '${esc(f.value)}'` : null
    case "neq":
      return f.value !== undefined ? `${expr} != '${esc(f.value)}'` : null
    case "contains":
      return f.value !== undefined
        ? `positionCaseInsensitive(toString(${expr}), '${esc(f.value)}') > 0`
        : null
    case "not_contains":
      return f.value !== undefined
        ? `positionCaseInsensitive(toString(${expr}), '${esc(f.value)}') = 0`
        : null
    case "exists":
      return `${expr} != ''`
    case "not_exists":
      return `${expr} = ''`
    case "gt":
      return `toFloat64OrZero(toString(${expr})) > ${Number(f.value) || 0}`
    case "gte":
      return `toFloat64OrZero(toString(${expr})) >= ${Number(f.value) || 0}`
    case "lt":
      return `toFloat64OrZero(toString(${expr})) < ${Number(f.value) || 0}`
    case "lte":
      return `toFloat64OrZero(toString(${expr})) <= ${Number(f.value) || 0}`
  }
}

function baseWhere(
  source: InsightSource,
  bounds: { projectId: string; from: Date; to: Date },
  filters: InsightFilter[] | undefined,
  context: SpanFilter,
): string {
  const parts = [
    `project_id = '${esc(bounds.projectId)}'`,
    `Timestamp >= parseDateTime64BestEffort('${iso(bounds.from)}', 9)`,
    `Timestamp < parseDateTime64BestEffort('${iso(bounds.to)}', 9)`,
  ]
  // Context URL filters (service etc.)
  if (context.service) parts.push(`ServiceName = '${esc(context.service)}'`)
  if (context.operation && source === "spans") {
    parts.push(`SpanName = '${esc(context.operation)}'`)
  }
  if (context.release) {
    parts.push(
      `(${resourceMap(source)}['service.version'] = '${esc(context.release)}' OR ${attrMap(source)}['service.version'] = '${esc(context.release)}')`,
    )
  }
  if (context.environment) {
    parts.push(
      `(${resourceMap(source)}['deployment.environment'] = '${esc(context.environment)}' OR ${attrMap(source)}['deployment.environment'] = '${esc(context.environment)}')`,
    )
  }
  if (context.q) {
    if (source === "logs") {
      parts.push(`positionCaseInsensitive(Body, '${esc(context.q)}') > 0`)
    } else {
      parts.push(`positionCaseInsensitive(SpanName, '${esc(context.q)}') > 0`)
    }
  }
  if (context.statusError && source === "spans") {
    parts.push(`StatusCode = 'STATUS_CODE_ERROR'`)
  }
  for (const af of context.attributeFilters ?? []) {
    const c = filterClause(source, af)
    if (c) parts.push(c)
  }
  for (const f of filters ?? []) {
    const c = filterClause(source, f)
    if (c) parts.push(c)
  }
  return parts.join(" AND ")
}

function measureAgg(
  source: InsightSource,
  measure: InsightMeasure,
  bucketSec: number,
): string {
  switch (measure.type) {
    case "count":
      return "count()"
    case "rate":
      return `count() / ${bucketSec}`
    case "errors":
      if (source === "logs") {
        return `countIf(SeverityText IN ('ERROR','FATAL','error','fatal'))`
      }
      return `countIf(StatusCode = 'STATUS_CODE_ERROR')`
    case "duration_quantile": {
      const q = measure.quantile
      return `quantile(${q})(Duration) / 1000000`
    }
    case "uniq":
      return `uniqExact(${fieldExpr(source, measure.field)})`
    case "avg_attr":
      return `avg(toFloat64OrZero(toString(${fieldExpr(source, measure.field)})))`
    case "sum_attr":
      return `sum(toFloat64OrZero(toString(${fieldExpr(source, measure.field)})))`
    case "count_if": {
      const clause = filterClause(source, {
        key: measure.field,
        op: measure.op,
        value: measure.value,
      })
      return clause ? `countIf(${clause})` : "count()"
    }
  }
}

function chartKind(kind: InsightKind): "line" | "bar" | "area" {
  if (kind === "bar") return "bar"
  if (kind === "area") return "area"
  return "line"
}

function assertSafeRawSql(sql: string): void {
  const stripped = sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
  if (!/^(with|select)\b/i.test(stripped)) {
    throw new Error("Raw SQL must be a SELECT (or WITH … SELECT)")
  }
  if (/;/.test(stripped)) {
    throw new Error("Raw SQL must be a single statement")
  }
  const banned =
    /\b(insert|update|delete|drop|alter|create|truncate|attach|detach|rename|grant|revoke|system|kill|optimize|exchange)\b/i
  if (banned.test(stripped)) {
    throw new Error("Raw SQL contains a forbidden keyword")
  }
}

async function runRawSql(
  config: ObserveClickHouseConfig,
  spec: InsightSpecRun,
  bounds: { projectId: string; from: Date; to: Date },
): Promise<InsightRunResult> {
  assertSafeRawSql(spec.rawSql!)
  const sql = spec.rawSql!
    .replaceAll("{{project_id}}", esc(bounds.projectId))
    .replaceAll("{{from}}", iso(bounds.from))
    .replaceAll("{{to}}", iso(bounds.to))

  const rows = await queryJson<Record<string, unknown>>(config, sql)
  const unit = spec.display?.unit

  if (spec.kind === "number") {
    const v = rows[0]?.v ?? rows[0]?.value ?? 0
    return { kind: "number", value: Number(v), unit }
  }

  const hasKey = rows.some((r) => r.key != null && String(r.key) !== "")
  if (hasKey || spec.kind === "table") {
    if (spec.kind === "table") {
      return {
        kind: "table",
        groupBy: spec.breakdown?.field ?? "key",
        unit,
        rows: rows.map((r) => ({
          key: String(r.key ?? r.t ?? ""),
          value: Number(r.v ?? 0),
        })),
      }
    }
    const keys = [...new Set(rows.map((r) => String(r.key ?? "series")))]
    const byT = new Map<number, Record<string, number>>()
    for (const r of rows) {
      const t =
        typeof r.t === "number"
          ? r.t
          : Date.parse(String(r.t ?? "")) || Number(r.t) || 0
      const key = String(r.key ?? "series")
      const cur = byT.get(t) ?? {}
      cur[key] = Number(r.v ?? 0)
      byT.set(t, cur)
    }
    const sorted = [...byT.keys()].sort((a, b) => a - b)
    return {
      kind: "multi",
      chartKind: chartKind(spec.kind),
      keys,
      stacked: spec.display?.stacked,
      unit,
      rows: sorted.map((t) => {
        const vals = byT.get(t) ?? {}
        return {
          t,
          label: new Date(t).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          ...Object.fromEntries(keys.map((k) => [k, vals[k] ?? 0])),
        } as { t: number; label: string } & Record<string, number>
      }),
    }
  }

  return {
    kind: "series",
    chartKind: chartKind(spec.kind),
    unit,
    series: rows.map((r) => {
      const t =
        typeof r.t === "number"
          ? r.t
          : Date.parse(String(r.t ?? "")) || Number(r.t) || 0
      return { t, v: Number(r.v ?? 0) }
    }),
  }
}

export async function runInsight(
  config: ObserveClickHouseConfig,
  spec: InsightSpecRun,
  context: SpanFilter,
  opts?: { buckets?: number; breakdownOverride?: string | null },
): Promise<InsightRunResult> {
  const bounds = {
    projectId: context.projectId,
    from: context.from,
    to: context.to,
  }

  if (spec.rawSql?.trim()) {
    return runRawSql(config, spec, bounds)
  }

  const source = spec.source ?? "spans"
  const table = source === "logs" ? "logs" : "spans"
  const where = baseWhere(source, bounds, spec.filters, context)
  const buckets = opts?.buckets ?? 48
  const sec = bucketSeconds(bounds.from, bounds.to, buckets)
  const windowSec = Math.max(
    (bounds.to.getTime() - bounds.from.getTime()) / 1000,
    1,
  )
  const unit =
    spec.display?.unit ??
    (spec.measure.type === "rate"
      ? "/s"
      : spec.measure.type === "duration_quantile"
        ? "ms"
        : undefined)

  const breakdownField =
    opts?.breakdownOverride === null
      ? undefined
      : (opts?.breakdownOverride ?? spec.breakdown?.field)
  const topN = spec.breakdown?.topN ?? 8

  // Number tile
  if (spec.kind === "number") {
    const agg = measureAgg(source, spec.measure, windowSec)
    const rows = await queryJson<{ v: string }>(
      config,
      `SELECT ${agg} AS v FROM ${table} WHERE ${where}`,
    )
    return { kind: "number", value: Number(rows[0]?.v ?? 0), unit }
  }

  // Table
  if (spec.kind === "table") {
    const dimField = breakdownField ?? "service"
    const dim = fieldExpr(source, dimField)
    const agg = measureAgg(source, spec.measure, windowSec)
    const rows = await queryJson<{ key: string; v: string }>(
      config,
      `
      SELECT ${dim} AS key, ${agg} AS v
      FROM ${table}
      WHERE ${where} AND ${dim} != ''
      GROUP BY key
      ORDER BY v DESC
      LIMIT ${topN}
      `,
    )
    return {
      kind: "table",
      groupBy: dimField,
      unit,
      rows: rows.map((r) => ({ key: r.key, value: Number(r.v) })),
    }
  }

  const agg = measureAgg(source, spec.measure, sec)
  const ck = chartKind(spec.kind)

  // Multi-series with breakdown
  if (breakdownField) {
    const dim = fieldExpr(source, breakdownField)
    const topKeys = await queryJson<{ key: string }>(
      config,
      `
      SELECT ${dim} AS key
      FROM ${table}
      WHERE ${where} AND ${dim} != ''
      GROUP BY key
      ORDER BY count() DESC
      LIMIT ${topN}
      `,
    )
    const keys = topKeys.map((r) => r.key).filter(Boolean)
    if (keys.length === 0) {
      return { kind: "series", chartKind: ck, series: [], unit }
    }
    const keyList = keys.map((k) => `'${esc(k)}'`).join(", ")
    const rows = await queryJson<{ bucket: string; key: string; v: string }>(
      config,
      `
      SELECT
        toStartOfInterval(Timestamp, INTERVAL ${sec} SECOND) AS bucket,
        ${dim} AS key,
        ${agg} AS v
      FROM ${table}
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
    const sorted = [...byT.keys()].sort((a, b) => a - b)
    return {
      kind: "multi",
      chartKind: ck,
      keys,
      stacked: spec.display?.stacked,
      unit,
      rows: sorted.map((t) => {
        const vals = byT.get(t) ?? {}
        return {
          t,
          label: new Date(t).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          ...Object.fromEntries(keys.map((k) => [k, vals[k] ?? 0])),
        } as { t: number; label: string } & Record<string, number>
      }),
    }
  }

  // Single series
  const rows = await queryJson<{ bucket: string; v: string }>(
    config,
    `
    SELECT
      toStartOfInterval(Timestamp, INTERVAL ${sec} SECOND) AS bucket,
      ${agg} AS v
    FROM ${table}
    WHERE ${where}
    GROUP BY bucket
    ORDER BY bucket ASC
    `,
  )
  return {
    kind: "series",
    chartKind: ck,
    unit,
    series: rows.map((r) => ({ t: parseBucket(r.bucket), v: Number(r.v) })),
  }
}
