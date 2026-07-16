import { z } from "zod"

import {
  baselineSpecSchema,
  filterClauseSchema,
  filterOpSchema,
  timeRangeSchema,
} from "@/lib/observe/context/types"

export const trendsAnalysisSchema = z.enum([
  "trends",
  "compare",
  "distributions",
])
export type TrendsAnalysis = z.infer<typeof trendsAnalysisSchema>

export const trendsSignalSchema = z.enum([
  "spans",
  "root_spans",
  "logs",
  "errors",
])
export type TrendsSignal = z.infer<typeof trendsSignalSchema>

export const trendsMeasureSchema = z.enum([
  "count",
  "rate",
  "uniq_traces",
  "sum",
  "avg",
  "min",
  "max",
  "p50",
  "p75",
  "p90",
  "p95",
  "p99",
  "error_rate",
  "success_rate",
  "distinct_attr",
])
export type TrendsMeasure = z.infer<typeof trendsMeasureSchema>

export const trendsIntervalSchema = z.enum([
  "auto",
  "10s",
  "1m",
  "5m",
  "15m",
  "1h",
  "6h",
  "1d",
  "1w",
])
export type TrendsInterval = z.infer<typeof trendsIntervalSchema>

export const trendsVizKindSchema = z.enum([
  "line",
  "area",
  "bar",
  "stacked_bar",
  "stacked_area",
  "number",
  "table",
  "histogram",
])
export type TrendsVizKind = z.infer<typeof trendsVizKindSchema>

/** Nested boolean filter groups. */
export const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    mode: z.enum(["and", "or", "not"]).default("and"),
    clauses: z.array(filterClauseSchema).default([]),
    groups: z.array(filterGroupSchema).default([]),
  }),
)

export type FilterGroup = {
  id: string
  mode: "and" | "or" | "not"
  clauses: z.infer<typeof filterClauseSchema>[]
  groups: FilterGroup[]
}

export const seriesDefSchema = z.object({
  id: z.string().min(1),
  letter: z.string().min(1).max(2),
  label: z.string().max(120).optional(),
  signal: trendsSignalSchema.default("spans"),
  measure: trendsMeasureSchema.default("rate"),
  /** Numeric / attribute field for sum/avg/percentiles/distinct */
  field: z.string().max(200).optional(),
  filters: z.array(filterClauseSchema).default([]),
  color: z.string().optional(),
  hidden: z.boolean().optional(),
})
export type SeriesDef = z.infer<typeof seriesDefSchema>

export const formulaDefSchema = z.object({
  id: z.string().min(1),
  letter: z.string().min(1).max(2),
  label: z.string().max(120).optional(),
  /** Arithmetic over series letters, e.g. B/A*100 */
  expr: z.string().min(1).max(200),
  unit: z.string().max(32).optional(),
  color: z.string().optional(),
  hidden: z.boolean().optional(),
})
export type FormulaDef = z.infer<typeof formulaDefSchema>

export const breakdownDefSchema = z.object({
  field: z.string().min(1).max(200),
  topN: z.number().int().min(1).max(50).default(25),
  rankBy: z
    .enum(["count", "latest", "avg", "max", "duration_sum"])
    .default("count"),
  otherBucket: z.boolean().default(true),
})
export type BreakdownDef = z.infer<typeof breakdownDefSchema>

export const referenceLineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  value: z.number(),
  unit: z.string().max(32).optional(),
  color: z.string().optional(),
  style: z.enum(["solid", "dashed"]).default("dashed"),
  hidden: z.boolean().optional(),
})
export type ReferenceLine = z.infer<typeof referenceLineSchema>

export const trendsVizOptionsSchema = z.object({
  stacked: z.boolean().optional(),
  fill: z.boolean().optional(),
  showLegend: z.boolean().optional(),
  yLog: z.boolean().optional(),
  yZero: z.boolean().optional(),
  missing: z.enum(["gap", "zero", "carry"]).optional(),
  unit: z.string().max(32).optional(),
  precision: z.number().int().min(0).max(6).optional(),
})
export type TrendsVizOptions = z.infer<typeof trendsVizOptionsSchema>

export const trendsQuerySchema = z.object({
  version: z.literal(1).default(1),
  analysis: trendsAnalysisSchema.default("trends"),
  series: z.array(seriesDefSchema).min(1),
  formulas: z.array(formulaDefSchema).default([]),
  filters: filterGroupSchema,
  breakdowns: z.array(breakdownDefSchema).default([]),
  time: timeRangeSchema.default({ kind: "preset", preset: "1h" }),
  interval: trendsIntervalSchema.default("auto"),
  baseline: baselineSpecSchema.default({ mode: "none" }),
  viz: z
    .object({
      kind: trendsVizKindSchema.default("line"),
      options: trendsVizOptionsSchema.optional(),
      referenceLines: z.array(referenceLineSchema).default([]),
    })
    .default({ kind: "line", referenceLines: [] }),
  excludeInternal: z.boolean().optional(),
})
export type TrendsQuery = z.infer<typeof trendsQuerySchema>

export type TrendsSeriesPoint = {
  t: number
  /** seriesKey → value (and optional baselineKey → value) */
  values: Record<string, number | null>
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
  /** Aligned time buckets */
  points: TrendsSeriesPoint[]
  /** Histogram mode */
  histogram?: { bin: number; count: number }[]
  /** Number mode (single value) */
  number?: { value: number; baseline?: number | null; unit?: string }
  sampled?: boolean
  partial?: boolean
  warnings?: string[]
}

export const SERIES_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")

export function nextSeriesLetter(
  existing: Array<{ letter: string }>,
): string {
  const used = new Set(existing.map((s) => s.letter))
  return SERIES_LETTERS.find((l) => !used.has(l)) ?? `S${existing.length + 1}`
}

export function emptyFilterGroup(id = "root"): FilterGroup {
  return { id, mode: "and", clauses: [], groups: [] }
}

export function defaultTrendsQuery(): TrendsQuery {
  return trendsQuerySchema.parse({
    version: 1,
    analysis: "trends",
    series: [
      {
        id: cryptoRandomId(),
        letter: "A",
        label: "Request rate",
        signal: "spans",
        measure: "rate",
        filters: [],
      },
    ],
    formulas: [],
    filters: emptyFilterGroup(),
    breakdowns: [],
    time: { kind: "preset", preset: "1h" },
    interval: "auto",
    baseline: { mode: "none" },
    viz: { kind: "line", referenceLines: [] },
  })
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `s_${Math.random().toString(36).slice(2, 10)}`
}

export { filterOpSchema, filterClauseSchema }
