import type { ObserveClickHouseConfig } from "../clickhouse/client"
import { esc, iso, queryJson, safeAttrKey } from "./common"

export type TrendsSignal = "spans" | "root_spans" | "logs" | "errors"
export type TrendsMeasure =
  | "count"
  | "rate"
  | "uniq_traces"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "p50"
  | "p75"
  | "p90"
  | "p95"
  | "p99"
  | "error_rate"
  | "success_rate"
  | "distinct_attr"

export type TrendsInterval =
  | "auto"
  | "10s"
  | "1m"
  | "5m"
  | "15m"
  | "1h"
  | "6h"
  | "1d"
  | "1w"

export type TrendsFilter = {
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

export type TrendsFilterGroup = {
  id: string
  mode: "and" | "or" | "not"
  clauses: TrendsFilter[]
  groups: TrendsFilterGroup[]
}

export type TrendsSeriesDef = {
  id: string
  letter: string
  label?: string
  signal: TrendsSignal
  measure: TrendsMeasure
  field?: string
  filters: TrendsFilter[]
  color?: string
  hidden?: boolean
}

export type TrendsFormulaDef = {
  id: string
  letter: string
  label?: string
  expr: string
  unit?: string
  color?: string
  hidden?: boolean
}

export type TrendsBreakdownDef = {
  field: string
  topN: number
  rankBy: "count" | "latest" | "avg" | "max" | "duration_sum"
  otherBucket: boolean
}

export type TrendsQueryRun = {
  analysis: "trends" | "compare" | "distributions"
  series: TrendsSeriesDef[]
  formulas: TrendsFormulaDef[]
  filters: TrendsFilterGroup
  breakdowns: TrendsBreakdownDef[]
  interval: TrendsInterval
  baseline: { mode: "none" } | { mode: "previous" } | { mode: "absolute"; from: string; to: string }
  viz: {
    kind: string
    options?: { unit?: string; stacked?: boolean; fill?: boolean }
  }
  excludeInternal?: boolean
}

export type TrendsResultSeriesMeta = {
  key: string
  letter: string
  label: string
  color?: string
  unit?: string
  hidden?: boolean
  isFormula?: boolean
  isBaseline?: boolean
  incomplete?: boolean
}

export type TrendsResult = {
  computedAt: string
  intervalSec: number
  from: string
  to: string
  seriesMeta: TrendsResultSeriesMeta[]
  points: Array<{ t: number; values: Record<string, number | null> }>
  histogram?: { bin: number; count: number }[]
  number?: { value: number; baseline?: number | null; unit?: string }
  sampled?: boolean
  partial?: boolean
  warnings?: string[]
}

type Bounds = { projectId: string; from: Date; to: Date }

const INTERVAL_SEC: Record<Exclude<TrendsInterval, "auto">, number> = {
  "10s": 10,
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "6h": 21600,
  "1d": 86400,
  "1w": 604800,
}

export function resolveIntervalSec(
  interval: TrendsInterval,
  from: Date,
  to: Date,
  targetBuckets = 90,
): number {
  if (interval !== "auto") return INTERVAL_SEC[interval]
  const windowMs = Math.max(to.getTime() - from.getTime(), 1)
  const sec = Math.max(Math.floor(windowMs / targetBuckets / 1000), 1)
  // Snap to a nice step
  const steps = [10, 30, 60, 120, 300, 900, 1800, 3600, 7200, 21600, 86400]
  return steps.find((s) => s >= sec) ?? sec
}

function parseBucket(bucket: string): number {
  if (bucket.includes("T")) return Date.parse(bucket)
  return Date.parse(bucket.replace(" ", "T") + "Z")
}

function attrMap(signal: TrendsSignal): string {
  return signal === "logs" || signal === "errors" ? "LogAttributes" : "SpanAttributes"
}

function resourceMap(): string {
  return "ResourceAttributes"
}

function tableFor(signal: TrendsSignal): string {
  if (signal === "logs" || signal === "errors") return "logs"
  return "spans"
}

export function trendsFieldExpr(signal: TrendsSignal, field: string): string {
  const f = field.trim()
  const attrKey = f.startsWith("attr:") ? f.slice(5) : null
  const known: Record<string, string> = {
    service: "ServiceName",
    operation: "SpanName",
    name: signal === "logs" || signal === "errors" ? "Body" : "SpanName",
    release: `coalesce(${resourceMap()}['service.version'], ${attrMap(signal)}['service.version'], '')`,
    environment: `coalesce(${resourceMap()}['deployment.environment'], ${attrMap(signal)}['deployment.environment'], '')`,
    status: "StatusCode",
    severity: "SeverityText",
    body: "Body",
    duration: "(Duration / 1000000)",
    duration_ms: "(Duration / 1000000)",
  }
  if (attrKey) {
    return `coalesce(${attrMap(signal)}['${esc(safeAttrKey(attrKey))}'], ${resourceMap()}['${esc(safeAttrKey(attrKey))}'], '')`
  }
  if (known[f]) return known[f]!
  return `coalesce(${attrMap(signal)}['${esc(f)}'], ${resourceMap()}['${esc(f)}'], '')`
}

function filterClause(signal: TrendsSignal, f: TrendsFilter): string | null {
  const expr = trendsFieldExpr(signal, f.key)
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

function compileFilterGroup(
  signal: TrendsSignal,
  group: TrendsFilterGroup,
): string | null {
  const parts: string[] = []
  for (const c of group.clauses) {
    const sql = filterClause(signal, c)
    if (sql) parts.push(sql)
  }
  for (const g of group.groups) {
    const sql = compileFilterGroup(signal, g)
    if (sql) parts.push(`(${sql})`)
  }
  if (parts.length === 0) return null
  if (group.mode === "or") return parts.join(" OR ")
  if (group.mode === "not") {
    if (parts.length === 1) return `NOT (${parts[0]})`
    return `NOT (${parts.join(" AND ")})`
  }
  return parts.join(" AND ")
}

function signalExtraWhere(signal: TrendsSignal): string[] {
  if (signal === "root_spans") return ["ParentSpanId = ''"]
  if (signal === "errors") {
    return [
      `(SeverityText IN ('ERROR','FATAL','error','fatal') OR StatusCode = 'STATUS_CODE_ERROR')`,
    ]
  }
  return []
}

function internalExclude(signal: TrendsSignal): string[] {
  // Health-check / synthetic heuristics
  const name =
    signal === "logs" || signal === "errors" ? "Body" : "SpanName"
  return [
    `positionCaseInsensitive(${name}, 'health') = 0`,
    `positionCaseInsensitive(${name}, 'ready') = 0`,
    `positionCaseInsensitive(${name}, 'live') = 0`,
    `${attrMap(signal)}['http.route'] != '/health'`,
    `${attrMap(signal)}['http.route'] != '/readyz'`,
  ]
}

function baseWhere(
  signal: TrendsSignal,
  bounds: Bounds,
  globalFilters: TrendsFilterGroup,
  seriesFilters: TrendsFilter[],
  excludeInternal?: boolean,
): string {
  const parts = [
    `project_id = '${esc(bounds.projectId)}'`,
    `Timestamp >= parseDateTime64BestEffort('${iso(bounds.from)}', 9)`,
    `Timestamp < parseDateTime64BestEffort('${iso(bounds.to)}', 9)`,
    ...signalExtraWhere(signal),
  ]
  if (excludeInternal) parts.push(...internalExclude(signal))
  const g = compileFilterGroup(signal, globalFilters)
  if (g) parts.push(`(${g})`)
  for (const f of seriesFilters) {
    const c = filterClause(signal, f)
    if (c) parts.push(c)
  }
  return parts.join(" AND ")
}

function measureAgg(
  signal: TrendsSignal,
  measure: TrendsMeasure,
  field: string | undefined,
  bucketSec: number,
): string {
  const numField = field
    ? field === "duration" || field === "duration_ms"
      ? trendsFieldExpr(signal, field)
      : `toFloat64OrZero(toString(${trendsFieldExpr(signal, field)}))`
    : signal === "logs" || signal === "errors"
      ? "1"
      : "(Duration / 1000000)"

  switch (measure) {
    case "count":
      return "count()"
    case "rate":
      return `count() / ${bucketSec}`
    case "uniq_traces":
      return "uniqExact(TraceId)"
    case "sum":
      return `sum(${numField})`
    case "avg":
      return `avg(${numField})`
    case "min":
      return `min(${numField})`
    case "max":
      return `max(${numField})`
    case "p50":
      return `quantile(0.5)(${numField})`
    case "p75":
      return `quantile(0.75)(${numField})`
    case "p90":
      return `quantile(0.9)(${numField})`
    case "p95":
      return `quantile(0.95)(${numField})`
    case "p99":
      return `quantile(0.99)(${numField})`
    case "error_rate": {
      if (signal === "logs" || signal === "errors") {
        return `countIf(SeverityText IN ('ERROR','FATAL','error','fatal')) / nullIf(count(), 0)`
      }
      return `countIf(StatusCode = 'STATUS_CODE_ERROR') / nullIf(count(), 0)`
    }
    case "success_rate": {
      if (signal === "logs" || signal === "errors") {
        return `1 - (countIf(SeverityText IN ('ERROR','FATAL','error','fatal')) / nullIf(count(), 0))`
      }
      return `1 - (countIf(StatusCode = 'STATUS_CODE_ERROR') / nullIf(count(), 0))`
    }
    case "distinct_attr":
      return `uniqExact(${trendsFieldExpr(signal, field ?? "service")})`
  }
}

function defaultUnit(measure: TrendsMeasure): string | undefined {
  if (measure === "rate") return "/s"
  if (["p50", "p75", "p90", "p95", "p99", "avg", "min", "max"].includes(measure))
    return "ms"
  if (measure === "error_rate" || measure === "success_rate") return "%"
  return undefined
}

function seriesLabel(s: TrendsSeriesDef): string {
  return s.label?.trim() || `${s.letter}: ${s.measure}`
}

/** Simple formula evaluator (A,B,+,-,*,/,()). */
export function evalFormula(
  expr: string,
  values: Record<string, number | null>,
): number | null {
  const TOKEN = /\s*([A-Z]+|\d+(?:\.\d+)?|\+|\-|\*|\/|\(|\))\s*/gy
  const tokens: string[] = []
  let last = 0
  let m: RegExpExecArray | null
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(expr))) {
    if (m.index !== last) return null
    tokens.push(m[1]!)
    last = TOKEN.lastIndex
  }
  if (last !== expr.length || tokens.length === 0) return null

  let i = 0
  const peek = () => tokens[i]
  const next = () => tokens[i++]

  function parsePrimary(): number | null {
    const t = next()
    if (t === "(") {
      const v = parseAdd()
      if (next() !== ")") return null
      return v
    }
    if (t === "-") {
      const v = parsePrimary()
      return v == null ? null : -v
    }
    if (!t) return null
    if (/^[A-Z]+$/.test(t)) {
      const v = values[t]
      return v === undefined ? null : v
    }
    if (/^\d/.test(t)) return Number(t)
    return null
  }
  function parseMul(): number | null {
    let left = parsePrimary()
    while (peek() === "*" || peek() === "/") {
      const op = next()!
      const right = parsePrimary()
      if (left == null || right == null) return null
      if (op === "/" && right === 0) return null
      left = op === "*" ? left * right : left / right
    }
    return left
  }
  function parseAdd(): number | null {
    let left = parseMul()
    while (peek() === "+" || peek() === "-") {
      const op = next()!
      const right = parseMul()
      if (left == null || right == null) return null
      left = op === "+" ? left + right : left - right
    }
    return left
  }
  const result = parseAdd()
  if (i !== tokens.length) return null
  return result
}

async function fetchSeriesBuckets(
  config: ObserveClickHouseConfig,
  signal: TrendsSignal,
  where: string,
  agg: string,
  sec: number,
  breakdown?: { field: string; topN: number; otherBucket: boolean },
): Promise<{
  keys: string[]
  byT: Map<number, Record<string, number>>
  warnings: string[]
}> {
  const warnings: string[] = []
  if (!breakdown) {
    const rows = await queryJson<{ bucket: string; v: string }>(
      config,
      `
      SELECT
        toStartOfInterval(Timestamp, INTERVAL ${sec} SECOND) AS bucket,
        ${agg} AS v
      FROM ${tableFor(signal)}
      WHERE ${where}
      GROUP BY bucket
      ORDER BY bucket ASC
      `,
    )
    const byT = new Map<number, Record<string, number>>()
    for (const r of rows) {
      byT.set(parseBucket(r.bucket), { "": Number(r.v) })
    }
    return { keys: [""], byT, warnings }
  }

  if (/trace.?id/i.test(breakdown.field)) {
    warnings.push(
      `Breaking down by ${breakdown.field} may have extreme cardinality`,
    )
  }

  const dim = trendsFieldExpr(signal, breakdown.field)
  const topKeys = await queryJson<{ key: string; c: string }>(
    config,
    `
    SELECT ${dim} AS key, count() AS c
    FROM ${tableFor(signal)}
    WHERE ${where} AND toString(${dim}) != ''
    GROUP BY key
    ORDER BY c DESC
    LIMIT ${breakdown.topN}
    `,
  )
  const keys = topKeys.map((r) => r.key).filter(Boolean)
  if (keys.length === 0) {
    return { keys: [""], byT: new Map(), warnings }
  }

  const card = await queryJson<{ n: string }>(
    config,
    `
    SELECT uniqExact(${dim}) AS n
    FROM ${tableFor(signal)}
    WHERE ${where} AND toString(${dim}) != ''
    `,
  )
  const cardN = Number(card[0]?.n ?? 0)
  if (cardN > breakdown.topN * 3) {
    warnings.push(
      `High cardinality on ${breakdown.field} (~${cardN} values); showing top ${breakdown.topN}`,
    )
  }

  const keyList = keys.map((k) => `'${esc(k)}'`).join(", ")
  const rows = await queryJson<{ bucket: string; key: string; v: string }>(
    config,
    `
    SELECT
      toStartOfInterval(Timestamp, INTERVAL ${sec} SECOND) AS bucket,
      ${dim} AS key,
      ${agg} AS v
    FROM ${tableFor(signal)}
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

  if (breakdown.otherBucket && cardN > keys.length) {
    const otherRows = await queryJson<{ bucket: string; v: string }>(
      config,
      `
      SELECT
        toStartOfInterval(Timestamp, INTERVAL ${sec} SECOND) AS bucket,
        ${agg} AS v
      FROM ${tableFor(signal)}
      WHERE ${where} AND (${dim} NOT IN (${keyList}) OR toString(${dim}) = '')
      GROUP BY bucket
      ORDER BY bucket ASC
      `,
    )
    for (const r of otherRows) {
      const t = parseBucket(r.bucket)
      const cur = byT.get(t) ?? {}
      cur["Other"] = Number(r.v)
      byT.set(t, cur)
    }
    keys.push("Other")
  }

  return { keys, byT, warnings }
}

function alignTimestamps(
  maps: Map<number, Record<string, number>>[],
): number[] {
  const set = new Set<number>()
  for (const m of maps) {
    for (const t of m.keys()) set.add(t)
  }
  return [...set].sort((a, b) => a - b)
}

function baselineBounds(
  from: Date,
  to: Date,
  baseline: TrendsQueryRun["baseline"],
): { from: Date; to: Date } | null {
  if (baseline.mode === "none") return null
  if (baseline.mode === "previous") {
    const dur = to.getTime() - from.getTime()
    return { from: new Date(from.getTime() - dur), to: new Date(from.getTime()) }
  }
  return { from: new Date(baseline.from), to: new Date(baseline.to) }
}

async function runHistogram(
  config: ObserveClickHouseConfig,
  query: TrendsQueryRun,
  bounds: Bounds,
): Promise<TrendsResult> {
  const series = query.series[0]!
  const where = baseWhere(
    series.signal,
    bounds,
    query.filters,
    series.filters,
    query.excludeInternal,
  )
  const field = series.field ?? "duration"
  const expr =
    field === "duration" || field === "duration_ms"
      ? trendsFieldExpr(series.signal, field)
      : `toFloat64OrZero(toString(${trendsFieldExpr(series.signal, field)}))`

  const rows = await queryJson<{ bin: string; c: string }>(
    config,
    `
    SELECT
      floor(${expr} / 10) * 10 AS bin,
      count() AS c
    FROM ${tableFor(series.signal)}
    WHERE ${where}
    GROUP BY bin
    ORDER BY bin ASC
    LIMIT 200
    `,
  )

  return {
    computedAt: new Date().toISOString(),
    intervalSec: 0,
    from: bounds.from.toISOString(),
    to: bounds.to.toISOString(),
    seriesMeta: [
      {
        key: series.letter,
        letter: series.letter,
        label: seriesLabel(series),
        color: series.color,
        hidden: series.hidden,
      },
    ],
    points: [],
    histogram: rows.map((r) => ({ bin: Number(r.bin), count: Number(r.c) })),
  }
}

export async function runTrends(
  config: ObserveClickHouseConfig,
  query: TrendsQueryRun,
  bounds: Bounds,
  opts?: { breakdownOverride?: string | null },
): Promise<TrendsResult> {
  const warnings: string[] = []
  const sec = resolveIntervalSec(query.interval, bounds.from, bounds.to)
  const now = Date.now()

  if (query.analysis === "distributions" || query.viz.kind === "histogram") {
    return runHistogram(config, query, bounds)
  }

  const breakdown =
    opts?.breakdownOverride === null
      ? undefined
      : opts?.breakdownOverride
        ? {
            field: opts.breakdownOverride,
            topN: query.breakdowns[0]?.topN ?? 25,
            otherBucket: query.breakdowns[0]?.otherBucket ?? true,
          }
        : query.breakdowns[0]
          ? {
              field: query.breakdowns[0].field,
              topN: query.breakdowns[0].topN,
              otherBucket: query.breakdowns[0].otherBucket,
            }
          : undefined

  // Phase 1: one breakdown applied to all series
  type Fetched = {
    series: TrendsSeriesDef
    keys: string[]
    byT: Map<number, Record<string, number>>
  }
  const fetched: Fetched[] = []

  for (const s of query.series) {
    if (s.hidden) continue
    const where = baseWhere(
      s.signal,
      bounds,
      query.filters,
      s.filters,
      query.excludeInternal,
    )
    const agg = measureAgg(s.signal, s.measure, s.field, sec)
    const { keys, byT, warnings: w } = await fetchSeriesBuckets(
      config,
      s.signal,
      where,
      agg,
      sec,
      breakdown,
    )
    warnings.push(...w)
    fetched.push({ series: s, keys, byT })
  }

  const timestamps = alignTimestamps(fetched.map((f) => f.byT))
  const seriesMeta: TrendsResultSeriesMeta[] = []
  const letterValuesAt = new Map<
    number,
    Record<string, number | null>
  >()

  for (const t of timestamps) {
    letterValuesAt.set(t, {})
  }

  for (const f of fetched) {
    const unit =
      query.viz.options?.unit ?? defaultUnit(f.series.measure)
    if (!breakdown || f.keys.length === 1 && f.keys[0] === "") {
      const key = f.series.letter
      seriesMeta.push({
        key,
        letter: f.series.letter,
        label: seriesLabel(f.series),
        color: f.series.color,
        unit,
        hidden: f.series.hidden,
      })
      for (const t of timestamps) {
        const v = f.byT.get(t)?.[""]
        const vals = letterValuesAt.get(t)!
        vals[key] = v === undefined ? null : v
        vals[f.series.letter] = vals[key]
      }
    } else {
      for (const dimKey of f.keys) {
        const key = `${f.series.letter}:${dimKey}`
        seriesMeta.push({
          key,
          letter: f.series.letter,
          label: `${seriesLabel(f.series)} · ${dimKey}`,
          color: f.series.color,
          unit,
          hidden: f.series.hidden,
        })
        for (const t of timestamps) {
          const v = f.byT.get(t)?.[dimKey]
          letterValuesAt.get(t)![key] = v === undefined ? null : v
        }
        // For formulas, also expose letter as sum of breakdown? Use primary key only for letter
      }
      // Letter = sum across breakdown keys for formula purposes
      for (const t of timestamps) {
        const row = f.byT.get(t) ?? {}
        let sum = 0
        let any = false
        for (const k of f.keys) {
          if (row[k] !== undefined) {
            sum += row[k]!
            any = true
          }
        }
        letterValuesAt.get(t)![f.series.letter] = any ? sum : null
      }
    }
  }

  // Formulas
  for (const formula of query.formulas) {
    if (formula.hidden) continue
    seriesMeta.push({
      key: formula.letter,
      letter: formula.letter,
      label: formula.label?.trim() || formula.expr,
      color: formula.color,
      unit: formula.unit,
      isFormula: true,
      hidden: formula.hidden,
    })
    for (const t of timestamps) {
      const vals = letterValuesAt.get(t)!
      const letterMap: Record<string, number | null> = {}
      for (const s of query.series) {
        letterMap[s.letter] = vals[s.letter] ?? null
      }
      vals[formula.letter] = evalFormula(formula.expr, letterMap)
    }
  }

  // Mark incomplete last bucket
  const lastT = timestamps[timestamps.length - 1]
  if (lastT !== undefined && lastT + sec * 1000 > now) {
    for (const m of seriesMeta) {
      m.incomplete = true
    }
  }

  // Baseline overlay
  const bl = baselineBounds(bounds.from, bounds.to, query.baseline)
  if (bl && query.series[0] && !query.series[0].hidden) {
    const s = query.series[0]
    const where = baseWhere(
      s.signal,
      { ...bounds, from: bl.from, to: bl.to },
      query.filters,
      s.filters,
      query.excludeInternal,
    )
    const agg = measureAgg(s.signal, s.measure, s.field, sec)
    const { byT } = await fetchSeriesBuckets(
      config,
      s.signal,
      where,
      agg,
      sec,
      undefined,
    )
    const blKey = `${s.letter}__baseline`
    seriesMeta.push({
      key: blKey,
      letter: s.letter,
      label: `${seriesLabel(s)} (baseline)`,
      color: s.color,
      unit: query.viz.options?.unit ?? defaultUnit(s.measure),
      isBaseline: true,
    })
    // Align by offset: baseline timestamps shifted to current window
    const offset = bounds.from.getTime() - bl.from.getTime()
    for (const t of timestamps) {
      const srcT = t - offset
      // find nearest bucket
      let nearest: number | null = null
      let best = Infinity
      for (const bt of byT.keys()) {
        const d = Math.abs(bt - srcT)
        if (d < best) {
          best = d
          nearest = bt
        }
      }
      const v =
        nearest != null && best < sec * 1000
          ? (byT.get(nearest)?.[""] ?? null)
          : null
      letterValuesAt.get(t)![blKey] = v
    }
  }

  // Number mode
  if (query.viz.kind === "number") {
    const primary = seriesMeta.find((m) => !m.isBaseline && !m.isFormula) ?? seriesMeta[0]
    let value = 0
    let n = 0
    for (const t of timestamps) {
      const v = letterValuesAt.get(t)?.[primary?.key ?? "A"]
      if (v != null) {
        value += v
        n++
      }
    }
    const avg = n ? value / n : 0
    let baselineVal: number | null = null
    const blMeta = seriesMeta.find((m) => m.isBaseline)
    if (blMeta) {
      let bv = 0
      let bn = 0
      for (const t of timestamps) {
        const v = letterValuesAt.get(t)?.[blMeta.key]
        if (v != null) {
          bv += v
          bn++
        }
      }
      baselineVal = bn ? bv / bn : null
    }
    return {
      computedAt: new Date().toISOString(),
      intervalSec: sec,
      from: bounds.from.toISOString(),
      to: bounds.to.toISOString(),
      seriesMeta,
      points: [],
      number: {
        value: avg,
        baseline: baselineVal,
        unit: primary?.unit,
      },
      warnings: warnings.length ? warnings : undefined,
    }
  }

  const points = timestamps.map((t) => ({
    t,
    values: letterValuesAt.get(t) ?? {},
  }))

  return {
    computedAt: new Date().toISOString(),
    intervalSec: sec,
    from: bounds.from.toISOString(),
    to: bounds.to.toISOString(),
    seriesMeta,
    points,
    warnings: warnings.length ? warnings : undefined,
  }
}

export function trendsResultToCsv(result: TrendsResult): string {
  const keys = result.seriesMeta.map((m) => m.key)
  const header = ["timestamp", ...keys].join(",")
  const lines = result.points.map((p) => {
    const cols = [
      new Date(p.t).toISOString(),
      ...keys.map((k) => {
        const v = p.values[k]
        return v == null ? "" : String(v)
      }),
    ]
    return cols.join(",")
  })
  return [header, ...lines].join("\n")
}
