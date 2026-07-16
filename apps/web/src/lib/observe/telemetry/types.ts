import { z } from "zod"

import {
  filterClauseSchema,
  filterOpSchema,
  spanScopeSchema,
  timeRangeSchema,
} from "@/lib/observe/context/types"
import {
  emptyFilterGroup as trendsEmptyFilterGroup,
  filterGroupSchema,
  type FilterGroup,
} from "@/lib/observe/trends/types"

export { filterOpSchema, filterClauseSchema, filterGroupSchema }
export type { FilterGroup }

export const telemetrySignalSchema = z.enum([
  "traces",
  "logs",
  "metrics",
  "errors",
])
export type TelemetrySignal = z.infer<typeof telemetrySignalSchema>

export const telemetryViewSchema = z.enum([
  "list",
  "traces",
  "timeseries",
  "table",
])
export type TelemetryView = z.infer<typeof telemetryViewSchema>

export const telemetryAggFnSchema = z.enum([
  "count",
  "count_distinct",
  "sum",
  "avg",
  "min",
  "max",
  "p50",
  "p75",
  "p90",
  "p95",
  "p99",
  "rate",
  "error_rate",
  "success_rate",
])
export type TelemetryAggFn = z.infer<typeof telemetryAggFnSchema>

export const telemetryQuerySchema = z.object({
  version: z.literal(1).default(1),
  signal: telemetrySignalSchema.default("traces"),
  timeRange: timeRangeSchema.default({ kind: "preset", preset: "1h" }),
  environment: z.array(z.string()).optional(),
  scope: spanScopeSchema.optional(),
  filter: filterGroupSchema,
  aggregation: z
    .object({
      function: telemetryAggFnSchema.default("count"),
      field: z.string().max(200).optional(),
      interval: z
        .enum(["auto", "10s", "1m", "5m", "15m", "1h", "6h", "1d", "1w"])
        .default("auto"),
    })
    .optional(),
  groupBy: z.array(z.string().max(200)).optional(),
  orderBy: z
    .array(
      z.object({
        field: z.string(),
        dir: z.enum(["asc", "desc"]).default("desc"),
      }),
    )
    .optional(),
  limit: z.number().int().min(1).max(500).optional(),
  q: z.string().max(500).optional(),
  metric: z
    .object({
      name: z.string().min(1),
      temporalAgg: z.enum(["avg", "sum", "min", "max", "rate", "increase"]),
      spatialAgg: z.enum(["avg", "sum", "min", "max"]),
    })
    .optional(),
  series: z
    .array(
      z.object({
        id: z.string().min(1),
        letter: z.string().min(1).max(2),
        label: z.string().max(120).optional(),
        signal: telemetrySignalSchema.optional(),
        measure: telemetryAggFnSchema,
        field: z.string().max(200).optional(),
        filters: z.array(filterClauseSchema).default([]),
      }),
    )
    .optional(),
  formulas: z
    .array(
      z.object({
        id: z.string().min(1),
        letter: z.string().min(1).max(2),
        label: z.string().max(120).optional(),
        expr: z.string().min(1).max(200),
        unit: z.string().max(32).optional(),
      }),
    )
    .optional(),
  traceMatch: z
    .object({
      relation: z.enum(["same_trace", "descendant", "child", "exclude"]),
      patternA: z.object({
        service: z.string().optional(),
        operation: z.string().optional(),
        statusError: z.boolean().optional(),
      }),
      patternB: z.object({
        service: z.string().optional(),
        operation: z.string().optional(),
        statusError: z.boolean().optional(),
      }),
    })
    .optional(),
  presentation: z
    .object({
      view: telemetryViewSchema.default("traces"),
      columns: z.array(z.string()).optional(),
      unit: z.string().max(32).optional(),
      legend: z.string().max(120).optional(),
      sort: z.enum(["newest", "slowest", "errors"]).default("newest"),
    })
    .default({ view: "traces", sort: "newest" }),
})
export type TelemetryQuery = z.infer<typeof telemetryQuerySchema>

export function emptyFilterGroup(id = "root"): FilterGroup {
  return trendsEmptyFilterGroup(id)
}

export function defaultTelemetryQuery(
  signal: TelemetrySignal = "traces",
): TelemetryQuery {
  return telemetryQuerySchema.parse({
    version: 1,
    signal,
    timeRange: { kind: "preset", preset: "1h" },
    scope: signal === "traces" ? "root" : undefined,
    filter: emptyFilterGroup(),
    aggregation: { function: "count", interval: "auto" },
    presentation: {
      view: signal === "traces" ? "traces" : "list",
      sort: "newest",
    },
  })
}
