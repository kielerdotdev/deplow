import { z } from "zod"

/** Filter operators for Context filter chips / builder. */
export const filterOpSchema = z.enum([
  "eq",
  "neq",
  "contains",
  "not_contains",
  "exists",
  "not_exists",
  "gt",
  "gte",
  "lt",
  "lte",
])
export type FilterOp = z.infer<typeof filterOpSchema>

export const filterClauseSchema = z.object({
  key: z.string().min(1),
  op: filterOpSchema,
  value: z.string().optional(),
})
export type FilterClause = z.infer<typeof filterClauseSchema>

export const timePresetSchema = z.enum([
  "15m",
  "1h",
  "6h",
  "24h",
  "7d",
  "14d",
  "30d",
])
export type TimePreset = z.infer<typeof timePresetSchema>

export const timeRangeSchema = z.union([
  z.object({
    kind: z.literal("preset"),
    preset: timePresetSchema,
  }),
  z.object({
    kind: z.literal("absolute"),
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  }),
])
export type TimeRange = z.infer<typeof timeRangeSchema>

export const baselineSpecSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({
    mode: z.literal("previous"),
    /** Length of comparison window relative to current range (same duration). */
  }),
  z.object({
    mode: z.literal("absolute"),
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  }),
])
export type BaselineSpec = z.infer<typeof baselineSpecSchema>

/** Rectangular brush on Explore heatmap (time × duration/error). */
export const selectionSchema = z.object({
  timeFrom: z.string().datetime({ offset: true }),
  timeTo: z.string().datetime({ offset: true }),
  yMin: z.number(),
  yMax: z.number(),
  yAxis: z.enum(["duration_ms", "error"]).default("duration_ms"),
})
export type Selection = z.infer<typeof selectionSchema>

export const querySpecSchema = z.object({
  /** Free-text / Lucene-ish query string (service, operation, message). */
  q: z.string().optional(),
  service: z.string().optional(),
  operation: z.string().optional(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  release: z.string().optional(),
  environment: z.string().optional(),
})
export type QuerySpec = z.infer<typeof querySpecSchema>

export const chartKindSchema = z.enum([
  "line",
  "bar",
  "number",
  "heatmap",
  "histogram",
  "table",
])
export type ChartKind = z.infer<typeof chartKindSchema>

export const chartSpecSchema = z.object({
  kind: chartKindSchema,
  metric: z.enum(["rate", "errors", "duration_p50", "duration_p95", "duration_p99", "count"]),
  groupBy: z.string().optional(),
})
export type ChartSpec = z.infer<typeof chartSpecSchema>

export const drilldownActionSchema = z.object({
  type: z.enum([
    "open_trace",
    "open_logs",
    "open_explore",
    "open_issue",
    "apply_filter",
  ]),
  params: z.record(z.string(), z.string()).default({}),
})
export type DrilldownAction = z.infer<typeof drilldownActionSchema>

/** Investigation state — URL is source of truth (no secrets). */
export const contextSchema = z.object({
  time: timeRangeSchema.default({ kind: "preset", preset: "1h" }),
  baseline: baselineSpecSchema.default({ mode: "none" }),
  filters: z.array(filterClauseSchema).default([]),
  query: querySpecSchema.default({}),
  selection: selectionSchema.optional(),
  /** Explore investigation tab */
  tab: z
    .enum([
      "root_spans",
      "anomalies",
      "traces",
      "logs",
      "database",
      "external",
    ])
    .optional(),
  chart: chartSpecSchema.optional(),
})
export type ObserveContext = z.infer<typeof contextSchema>

export type QueryState =
  | "idle"
  | "loading"
  | "streaming"
  | "empty"
  | "partial"
  | "sampled"
  | "stale"
  | "error"

export const TIME_PRESET_MS: Record<TimePreset, number> = {
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
  "14d": 14 * 24 * 60 * 60_000,
  "30d": 30 * 24 * 60 * 60_000,
}

export function resolveTimeRange(
  time: TimeRange,
  now = Date.now(),
): { from: Date; to: Date } {
  if (time.kind === "absolute") {
    return { from: new Date(time.from), to: new Date(time.to) }
  }
  const ms = TIME_PRESET_MS[time.preset]
  return { from: new Date(now - ms), to: new Date(now) }
}

export function resolveBaselineRange(
  baseline: BaselineSpec,
  current: { from: Date; to: Date },
): { from: Date; to: Date } | null {
  if (baseline.mode === "none") return null
  if (baseline.mode === "absolute") {
    return { from: new Date(baseline.from), to: new Date(baseline.to) }
  }
  const duration = current.to.getTime() - current.from.getTime()
  return {
    from: new Date(current.from.getTime() - duration),
    to: new Date(current.from.getTime()),
  }
}
