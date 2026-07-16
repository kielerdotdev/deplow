import type { ObserveContext } from "@/lib/observe/context"
import type { TrendsQuery } from "@/lib/observe/trends"
import { emptyFilterGroup as trendsEmpty } from "@/lib/observe/trends"

import {
  defaultTelemetryQuery,
  emptyFilterGroup,
  telemetryAggFnSchema,
  telemetryQuerySchema,
  type TelemetryAggFn,
  type TelemetryQuery,
} from "./types"

/** Lift ObserveContext investigation state into TelemetryQuery. */
export function contextToTelemetryQuery(
  ctx: ObserveContext,
  signal: TelemetryQuery["signal"] = "traces",
): TelemetryQuery {
  const filter = emptyFilterGroup()
  filter.clauses = [...ctx.filters]
  if (ctx.query.service) {
    filter.clauses.push({ key: "service", op: "eq", value: ctx.query.service })
  }
  if (ctx.query.operation) {
    filter.clauses.push({
      key: "operation",
      op: "eq",
      value: ctx.query.operation,
    })
  }
  if (ctx.query.release) {
    filter.clauses.push({ key: "release", op: "eq", value: ctx.query.release })
  }
  if (ctx.query.environment) {
    filter.clauses.push({
      key: "environment",
      op: "eq",
      value: ctx.query.environment,
    })
  }
  if (ctx.query.errorsOnly) {
    filter.clauses.push({ key: "status", op: "eq", value: "error" })
  }
  if (ctx.query.minDurationMs != null) {
    filter.clauses.push({
      key: "duration_ms",
      op: "gte",
      value: String(ctx.query.minDurationMs),
    })
  }

  return telemetryQuerySchema.parse({
    version: 1,
    signal,
    timeRange: ctx.time,
    environment: ctx.query.environment ? [ctx.query.environment] : undefined,
    scope: ctx.query.spanScope ?? (signal === "traces" ? "root" : undefined),
    filter,
    q: ctx.query.q,
    aggregation: { function: "count", interval: "auto" },
    presentation: {
      view: signal === "traces" ? "traces" : "list",
      sort: "newest",
    },
  })
}

/** Project TelemetryQuery back to ObserveContext for legacy surfaces. */
export function telemetryQueryToContext(query: TelemetryQuery): ObserveContext {
  const env = query.environment?.[0]
  const service = query.filter.clauses.find(
    (c) => c.key === "service" && c.op === "eq",
  )?.value
  const operation = query.filter.clauses.find(
    (c) => c.key === "operation" && c.op === "eq",
  )?.value
  const release = query.filter.clauses.find(
    (c) => c.key === "release" && c.op === "eq",
  )?.value
  const errorsOnly = query.filter.clauses.some(
    (c) => c.key === "status" && c.value === "error",
  )
  const minDuration = query.filter.clauses.find(
    (c) =>
      (c.key === "duration_ms" || c.key === "duration") &&
      (c.op === "gte" || c.op === "gt"),
  )?.value

  const known = new Set([
    "service",
    "operation",
    "release",
    "environment",
    "status",
    "duration",
    "duration_ms",
  ])
  const filters = query.filter.clauses.filter((c) => !known.has(c.key))

  return {
    time: query.timeRange,
    baseline: { mode: "none" },
    filters,
    query: {
      q: query.q,
      service,
      operation,
      release,
      environment: env,
      spanScope: query.scope,
      errorsOnly: errorsOnly || undefined,
      minDurationMs: minDuration != null ? Number(minDuration) : undefined,
    },
  }
}

/** Convert TrendsQuery into TelemetryQuery (single-series projection). */
export function trendsToTelemetryQuery(tq: TrendsQuery): TelemetryQuery {
  const series = tq.series[0]
  const signal: TelemetryQuery["signal"] =
    series?.signal === "logs"
      ? "logs"
      : series?.signal === "errors"
        ? "errors"
        : "traces"
  const view =
    tq.viz.kind === "table"
      ? ("table" as const)
      : tq.viz.kind === "number"
        ? ("timeseries" as const)
        : ("timeseries" as const)

  const measureParsed = telemetryAggFnSchema.safeParse(series?.measure)
  const fn: TelemetryAggFn = measureParsed.success
    ? measureParsed.data
    : "count"

  return telemetryQuerySchema.parse({
    version: 1,
    signal,
    timeRange: tq.time,
    scope: series?.signal === "root_spans" ? "root" : "all",
    filter: tq.filters ?? trendsEmpty(),
    aggregation: {
      function: fn,
      field: series?.field,
      interval: tq.interval,
    },
    groupBy: tq.breakdowns.map((b) => b.field),
    presentation: {
      view,
      unit: tq.viz.options?.unit,
      legend: series?.label,
      sort: "newest",
    },
  })
}

/** Parse opaque saved-view / alert contextJson into TelemetryQuery. */
export function parseStoredQuery(raw: unknown): TelemetryQuery {
  if (typeof raw === "string") {
    try {
      return parseStoredQuery(JSON.parse(raw))
    } catch {
      return defaultTelemetryQuery()
    }
  }
  if (!raw || typeof raw !== "object") return defaultTelemetryQuery()

  const obj = raw as Record<string, unknown>
  if (obj.version === 1 && "presentation" in obj && "filter" in obj) {
    const parsed = telemetryQuerySchema.safeParse(obj)
    if (parsed.success) return parsed.data
  }
  if ("trendsQuery" in obj) {
    return trendsToTelemetryQuery(obj.trendsQuery as TrendsQuery)
  }
  if ("series" in obj && "filters" in obj) {
    return trendsToTelemetryQuery(obj as unknown as TrendsQuery)
  }
  if ("time" in obj && "query" in obj) {
    return contextToTelemetryQuery(obj as unknown as ObserveContext)
  }
  return defaultTelemetryQuery()
}
