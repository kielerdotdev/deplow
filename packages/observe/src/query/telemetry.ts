/**
 * Unified TelemetryQuery contract.
 *
 * One versioned query object powers list/traces/timeseries/table views,
 * saved views, dashboard panels, and threshold alerts.
 */
import type { ObserveClickHouseConfig } from "../clickhouse/client"
import {
  queryJson,
  spanWhere,
  type SpanFilter,
  type SpanScope,
} from "./common"
import { logsHistogram, searchLogs, type LogFilter, type LogRow } from "./logs"
import {
  listTraces,
  tracesHistogram,
  type TraceListItem,
} from "./traces"
import {
  listTracesByMatch,
  type TraceMatchPattern,
  type TraceMatchRelation,
} from "./trace-match"
import {
  runTrends,
  type TrendsFilter,
  type TrendsFilterGroup,
  type TrendsFormulaDef,
  type TrendsMeasure,
  type TrendsQueryRun,
  type TrendsResult,
  type TrendsSeriesDef,
  type TrendsSignal,
} from "./trends-run"
import {
  listMetrics,
  runMetricsSeries,
  type MetricCatalogItem,
  type MetricsSeriesResult,
} from "./metrics-query"

export type TelemetrySignal = "traces" | "logs" | "metrics" | "errors"

export type TelemetryView = "list" | "traces" | "timeseries" | "table"

export type TelemetryAggFn =
  | "count"
  | "count_distinct"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "p50"
  | "p75"
  | "p90"
  | "p95"
  | "p99"
  | "rate"
  | "error_rate"
  | "success_rate"

export type TelemetryFilterOp =
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

export type TelemetryFilterClause = {
  key: string
  op: TelemetryFilterOp
  value?: string
}

export type TelemetryFilterGroup = {
  id: string
  mode: "and" | "or" | "not"
  clauses: TelemetryFilterClause[]
  groups: TelemetryFilterGroup[]
}

export type TelemetryTimeRange =
  | { kind: "preset"; preset: "15m" | "1h" | "6h" | "24h" | "7d" | "14d" | "30d" }
  | { kind: "absolute"; from: string; to: string }

export type TelemetryQuery = {
  version: 1
  signal: TelemetrySignal
  timeRange: TelemetryTimeRange
  environment?: string[]
  scope?: SpanScope
  filter: TelemetryFilterGroup
  aggregation?: {
    function: TelemetryAggFn
    field?: string
    interval?:
      | "auto"
      | "10s"
      | "1m"
      | "5m"
      | "15m"
      | "1h"
      | "6h"
      | "1d"
      | "1w"
  }
  groupBy?: string[]
  orderBy?: Array<{ field: string; dir: "asc" | "desc" }>
  limit?: number
  /** Free-text against span name / log body */
  q?: string
  /** Metrics-only */
  metric?: {
    name: string
    temporalAgg: "avg" | "sum" | "min" | "max" | "rate" | "increase"
    spatialAgg: "avg" | "sum" | "min" | "max"
  }
  /** Multi-series (advanced). When set, overrides single aggregation. */
  series?: Array<{
    id: string
    letter: string
    label?: string
    signal?: TelemetrySignal
    measure: TelemetryAggFn
    field?: string
    filters?: TelemetryFilterClause[]
  }>
  /** Formulas over series letters, e.g. (A/B)*100 */
  formulas?: Array<{
    id: string
    letter: string
    label?: string
    expr: string
    unit?: string
  }>
  /** Trace relationship query (A → B). */
  traceMatch?: {
    relation: TraceMatchRelation
    patternA: TraceMatchPattern
    patternB: TraceMatchPattern
  }
  presentation: {
    view: TelemetryView
    columns?: string[]
    unit?: string
    legend?: string
    sort?: "newest" | "slowest" | "errors"
  }
}

export type TelemetrySpanListItem = {
  trace_id: string
  span_id: string
  service: string
  name: string
  duration_ms: number
  status: string
  start: string
  kind: string
}

export type QueryResult =
  | {
      kind: "traces"
      rows: TraceListItem[]
      histogram: Array<{ t: number; count: number; errors: number }>
    }
  | {
      kind: "list"
      rows: TelemetrySpanListItem[] | LogRow[]
      histogram: Array<{ t: number; count: number; errors?: number }>
    }
  | {
      kind: "timeseries" | "table"
      trends: TrendsResult
    }
  | {
      kind: "metrics"
      catalog?: MetricCatalogItem[]
      series?: MetricsSeriesResult
    }

export function emptyFilterGroup(id = "root"): TelemetryFilterGroup {
  return { id, mode: "and", clauses: [], groups: [] }
}

export function defaultTelemetryQuery(
  signal: TelemetrySignal = "traces",
): TelemetryQuery {
  return {
    version: 1,
    signal,
    timeRange: { kind: "preset", preset: "1h" },
    scope: signal === "traces" ? "root" : undefined,
    filter: emptyFilterGroup(),
    aggregation: {
      function: "count",
      interval: "auto",
    },
    presentation: {
      view: signal === "traces" ? "traces" : "list",
      sort: "newest",
    },
  }
}

export function resolveTelemetryTimeRange(
  range: TelemetryTimeRange,
  now = new Date(),
): { from: Date; to: Date } {
  if (range.kind === "absolute") {
    return { from: new Date(range.from), to: new Date(range.to) }
  }
  const ms: Record<typeof range.preset, number> = {
    "15m": 15 * 60_000,
    "1h": 60 * 60_000,
    "6h": 6 * 60 * 60_000,
    "24h": 24 * 60 * 60_000,
    "7d": 7 * 24 * 60 * 60_000,
    "14d": 14 * 24 * 60 * 60_000,
    "30d": 30 * 24 * 60 * 60_000,
  }
  const to = now
  return { from: new Date(to.getTime() - ms[range.preset]), to }
}

function flattenFilterClauses(
  group: TelemetryFilterGroup,
): TelemetryFilterClause[] {
  const out: TelemetryFilterClause[] = [...group.clauses]
  for (const g of group.groups) {
    if (g.mode === "and" || group.mode === "and") {
      out.push(...flattenFilterClauses(g))
    } else {
      // Nested OR/NOT: keep only top-level AND flattening for SpanFilter path;
      // Trends path preserves full tree.
      out.push(...flattenFilterClauses(g))
    }
  }
  return out
}

function envClause(environments?: string[]): TelemetryFilterClause | null {
  if (!environments?.length) return null
  // Single env → eq; multi → first eq (OR support lands with Trends path)
  return { key: "environment", op: "eq", value: environments[0] }
}

/** Compile TelemetryQuery → SpanFilter for list/traces views. */
export function telemetryToSpanFilter(
  projectId: string,
  query: TelemetryQuery,
  now = new Date(),
): SpanFilter {
  const { from, to } = resolveTelemetryTimeRange(query.timeRange, now)
  const clauses = flattenFilterClauses(query.filter)
  const env = envClause(query.environment)
  if (env) clauses.push(env)

  let service: string | undefined
  let operation: string | undefined
  let release: string | undefined
  let environment: string | undefined
  let statusError: boolean | undefined
  let durationMsMin: number | undefined
  let durationMsMax: number | undefined
  const attributeFilters: SpanFilter["attributeFilters"] = []

  for (const c of clauses) {
    if (c.key === "service" && c.op === "eq") service = c.value
    else if (c.key === "operation" && c.op === "eq") operation = c.value
    else if (c.key === "release" && c.op === "eq") release = c.value
    else if (c.key === "environment" && c.op === "eq") environment = c.value
    else if (c.key === "status" && (c.value === "error" || c.op === "eq")) {
      if (c.value === "error" || c.value === "STATUS_CODE_ERROR") {
        statusError = true
      }
    } else if (c.key === "duration" || c.key === "duration_ms") {
      const n = Number(c.value)
      if (!Number.isFinite(n)) continue
      if (c.op === "gte" || c.op === "gt") durationMsMin = n
      if (c.op === "lte" || c.op === "lt") durationMsMax = n
    } else {
      attributeFilters.push({
        key: c.key.startsWith("attr:") ? c.key.slice(5) : c.key,
        op: c.op,
        value: c.value,
      })
    }
  }

  return {
    projectId,
    from,
    to,
    service,
    operation,
    release,
    environment,
    statusError,
    spanScope: query.scope ?? (query.signal === "traces" ? "root" : "all"),
    q: query.q,
    attributeFilters: attributeFilters.length ? attributeFilters : undefined,
    durationMsMin,
    durationMsMax,
  }
}

function toTrendsSignal(query: TelemetryQuery): TrendsSignal {
  if (query.signal === "logs") return "logs"
  if (query.signal === "errors") return "errors"
  if (query.scope === "root" || query.presentation.view === "traces") {
    return "root_spans"
  }
  return "spans"
}

function toTrendsMeasure(fn: TelemetryAggFn): TrendsMeasure {
  const map: Record<TelemetryAggFn, TrendsMeasure> = {
    count: "count",
    count_distinct: "distinct_attr",
    sum: "sum",
    avg: "avg",
    min: "min",
    max: "max",
    p50: "p50",
    p75: "p75",
    p90: "p90",
    p95: "p95",
    p99: "p99",
    rate: "rate",
    error_rate: "error_rate",
    success_rate: "success_rate",
  }
  return map[fn]
}

function toTrendsFilterGroup(group: TelemetryFilterGroup): TrendsFilterGroup {
  return {
    id: group.id,
    mode: group.mode,
    clauses: group.clauses.map(
      (c): TrendsFilter => ({
        key: c.key,
        op: c.op,
        value: c.value,
      }),
    ),
    groups: group.groups.map(toTrendsFilterGroup),
  }
}

function seriesSignal(
  query: TelemetryQuery,
  signal?: TelemetrySignal,
): TrendsSignal {
  const s = signal ?? query.signal
  if (s === "logs") return "logs"
  if (s === "errors") return "errors"
  if (query.scope === "root" || query.presentation.view === "traces") {
    return "root_spans"
  }
  return "spans"
}

/** Compile TelemetryQuery → TrendsQueryRun for timeseries/table. */
export function telemetryToTrendsRun(query: TelemetryQuery): TrendsQueryRun {
  const agg = query.aggregation ?? {
    function: "count" as const,
    interval: "auto" as const,
  }
  const signal = toTrendsSignal(query)
  const filters = toTrendsFilterGroup(query.filter)
  if (query.environment?.length) {
    filters.clauses.push({
      key: "environment",
      op: "eq",
      value: query.environment[0],
    })
  }
  if (query.q) {
    filters.clauses.push({
      key: signal === "logs" || signal === "errors" ? "body" : "operation",
      op: "contains",
      value: query.q,
    })
  }

  let series: TrendsSeriesDef[]
  if (query.series?.length) {
    series = query.series.map((s) => {
      const measure = toTrendsMeasure(s.measure)
      let field = s.field
      if (
        !field &&
        (measure.startsWith("p") ||
          measure === "avg" ||
          measure === "sum" ||
          measure === "min" ||
          measure === "max")
      ) {
        field = "duration"
      }
      return {
        id: s.id,
        letter: s.letter,
        label: s.label,
        signal: seriesSignal(query, s.signal),
        measure,
        field,
        filters: (s.filters ?? []).map((c) => ({
          key: c.key,
          op: c.op,
          value: c.value,
        })),
      }
    })
  } else {
    const measure = toTrendsMeasure(agg.function)
    let field = agg.field
    if (
      !field &&
      (measure.startsWith("p") ||
        measure === "avg" ||
        measure === "sum" ||
        measure === "min" ||
        measure === "max")
    ) {
      field = "duration"
    }
    series = [
      {
        id: "A",
        letter: "A",
        label: query.presentation.legend ?? agg.function,
        signal,
        measure,
        field,
        filters: [],
      },
    ]
  }

  const formulas: TrendsFormulaDef[] = (query.formulas ?? []).map((f) => ({
    id: f.id,
    letter: f.letter,
    label: f.label,
    expr: f.expr,
    unit: f.unit,
  }))

  return {
    analysis: "trends",
    series,
    formulas,
    filters,
    breakdowns: (query.groupBy ?? []).map((fieldName) => ({
      field: fieldName,
      topN: query.limit ?? 25,
      rankBy: "count" as const,
      otherBucket: true,
    })),
    interval: agg.interval ?? "auto",
    baseline: { mode: "none" },
    viz: {
      kind: query.presentation.view === "table" ? "table" : "line",
      options: { unit: query.presentation.unit },
    },
  }
}

export function telemetryToLogFilter(
  projectId: string,
  query: TelemetryQuery,
  now = new Date(),
): LogFilter {
  const span = telemetryToSpanFilter(projectId, query, now)
  const clauses = flattenFilterClauses(query.filter)
  let severity: string | undefined
  const attributeFilters: LogFilter["attributeFilters"] = []
  for (const c of clauses) {
    if (c.key === "severity" && c.op === "eq") severity = c.value
    else if (
      c.key !== "service" &&
      c.key !== "environment" &&
      c.key !== "status"
    ) {
      attributeFilters.push({
        key: c.key.startsWith("attr:") ? c.key.slice(5) : c.key,
        op: c.op,
        value: c.value,
      })
    }
  }
  return {
    projectId,
    from: span.from,
    to: span.to,
    service: span.service,
    environment: span.environment,
    severity,
    q: query.q,
    limit: query.limit ?? 100,
    offset: 0,
    attributeFilters: attributeFilters.length ? attributeFilters : undefined,
  }
}

async function listSpans(
  config: ObserveClickHouseConfig,
  filter: SpanFilter,
  limit: number,
  sort: TelemetryQuery["presentation"]["sort"],
): Promise<TelemetrySpanListItem[]> {
  const where = spanWhere(filter)
  const order =
    sort === "slowest"
      ? "Duration DESC"
      : sort === "errors"
        ? "StatusCode DESC, Timestamp DESC"
        : "Timestamp DESC"
  const rows = await queryJson<{
    trace_id: string
    span_id: string
    service: string
    name: string
    duration_ns: string
    status: string
    start: string
    kind: string
  }>(
    config,
    `
    SELECT
      TraceId AS trace_id,
      SpanId AS span_id,
      ServiceName AS service,
      SpanName AS name,
      Duration AS duration_ns,
      StatusCode AS status,
      Timestamp AS start,
      SpanKind AS kind
    FROM spans
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ${Math.min(Math.max(limit, 1), 500)}
    `,
  )
  return rows.map((r) => ({
    trace_id: r.trace_id,
    span_id: r.span_id,
    service: r.service,
    name: r.name,
    duration_ms: Number(r.duration_ns) / 1e6,
    status: r.status,
    start: r.start,
    kind: r.kind,
  }))
}

/** Execute a TelemetryQuery and return a discriminated result. */
export async function runTelemetryQuery(
  config: ObserveClickHouseConfig,
  projectId: string,
  query: TelemetryQuery,
): Promise<QueryResult> {
  const view = query.presentation.view
  const limit = query.limit ?? 50

  if (query.signal === "metrics") {
    if (!query.metric?.name) {
      const catalog = await listMetrics(config, projectId)
      return { kind: "metrics", catalog }
    }
    const { from, to } = resolveTelemetryTimeRange(query.timeRange)
    const series = await runMetricsSeries(config, {
      projectId,
      metricName: query.metric.name,
      from,
      to,
      temporalAgg: query.metric.temporalAgg,
      spatialAgg: query.metric.spatialAgg,
      groupBy: query.groupBy,
      interval: query.aggregation?.interval ?? "auto",
    })
    return { kind: "metrics", series }
  }

  if (view === "timeseries" || view === "table") {
    const { from, to } = resolveTelemetryTimeRange(query.timeRange)
    const trends = await runTrends(config, telemetryToTrendsRun(query), {
      projectId,
      from,
      to,
    })
    return { kind: view, trends }
  }

  if (query.traceMatch && query.signal === "traces") {
    const { from, to } = resolveTelemetryTimeRange(query.timeRange)
    const rows = await listTracesByMatch(config, {
      projectId,
      from,
      to,
      patternA: query.traceMatch.patternA,
      patternB: query.traceMatch.patternB,
      relation: query.traceMatch.relation,
      limit,
    })
    return { kind: "traces", rows, histogram: [] }
  }

  if (query.signal === "logs" || query.signal === "errors") {
    const logFilter = telemetryToLogFilter(projectId, query)
    if (query.signal === "errors") {
      logFilter.severity = logFilter.severity ?? "ERROR"
    }
    const [rows, histogram] = await Promise.all([
      searchLogs(config, logFilter),
      logsHistogram(config, logFilter),
    ])
    return {
      kind: "list",
      rows,
      histogram: histogram.map((h) => ({ t: h.t, count: h.count })),
    }
  }

  const spanFilter = telemetryToSpanFilter(projectId, query)

  if (view === "traces") {
    let rows = await listTraces(config, spanFilter, limit)
    if (query.presentation.sort === "slowest") {
      rows = [...rows].sort((a, b) => b.duration_ms - a.duration_ms)
    } else if (query.presentation.sort === "errors") {
      rows = [...rows].sort((a, b) => b.error_count - a.error_count)
    }
    const histogram = await tracesHistogram(config, spanFilter)
    return {
      kind: "traces",
      rows,
      histogram: histogram.map((h) => ({
        t: h.t,
        count: h.count,
        errors: h.error_count,
      })),
    }
  }

  // list view — individual spans
  const rows = await listSpans(
    config,
    spanFilter,
    limit,
    query.presentation.sort,
  )
  const histogram = await tracesHistogram(config, spanFilter)
  return {
    kind: "list",
    rows,
    histogram: histogram.map((h) => ({
      t: h.t,
      count: h.count,
      errors: h.error_count,
    })),
  }
}

/** Plain-English summary for progressive disclosure. */
export function summarizeTelemetryQuery(query: TelemetryQuery): string {
  const parts: string[] = []
  const scope =
    query.scope === "all"
      ? "all spans"
      : query.scope === "entrypoint"
        ? "entrypoint spans"
        : "root traces"
  if (query.signal === "logs") parts.push("Logs")
  else if (query.signal === "metrics") parts.push("Metrics")
  else if (query.signal === "errors") parts.push("Error logs")
  else parts.push(scope)

  if (query.environment?.length) {
    parts.push(`in ${query.environment.join(", ")}`)
  }

  const clauses = flattenFilterClauses(query.filter)
  if (clauses.length) {
    const bits = clauses
      .slice(0, 3)
      .map((c) =>
        c.op === "exists"
          ? `${c.key} exists`
          : `${c.key} ${c.op} ${c.value ?? ""}`.trim(),
      )
    parts.push(`where ${bits.join(" and ")}${clauses.length > 3 ? "…" : ""}`)
  }

  if (query.presentation.view === "timeseries" || query.presentation.view === "table") {
    if (query.formulas?.length) {
      parts.push(`formula ${query.formulas.map((f) => f.expr).join(", ")}`)
    } else {
      const fn = query.aggregation?.function ?? "count"
      const field = query.aggregation?.field
      parts.push(`showing ${fn}${field ? `(${field})` : ""}`)
    }
    if (query.groupBy?.length) {
      parts.push(`by ${query.groupBy.join(", ")}`)
    }
    const every = query.aggregation?.interval ?? "auto"
    if (query.presentation.view === "timeseries") {
      parts.push(`every ${every}`)
    }
  }

  if (query.traceMatch) {
    parts.push(
      `matching ${query.traceMatch.relation} (${query.traceMatch.patternA.service ?? "*"} → ${query.traceMatch.patternB.service ?? "*"})`,
    )
  }

  return parts.join(", ")
}
