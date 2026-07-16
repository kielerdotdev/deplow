import type { InsightSpec } from "@/lib/observe/insights"
import { insightSpecSchema } from "@/lib/observe/insights"
import {
  defaultTrendsQuery,
  emptyFilterGroup,
  trendsQuerySchema,
  type SeriesDef,
  type TrendsMeasure,
  type TrendsQuery,
  type TrendsSignal,
  type TrendsVizKind,
} from "./types"

function measureFromInsight(spec: InsightSpec): {
  measure: TrendsMeasure
  field?: string
} {
  switch (spec.measure.type) {
    case "count":
      return { measure: "count" }
    case "rate":
      return { measure: "rate" }
    case "errors":
      return { measure: "error_rate" }
    case "duration_quantile": {
      const q = spec.measure.quantile
      if (q <= 0.5) return { measure: "p50", field: "duration" }
      if (q <= 0.75) return { measure: "p75", field: "duration" }
      if (q <= 0.9) return { measure: "p90", field: "duration" }
      if (q >= 0.99) return { measure: "p99", field: "duration" }
      return { measure: "p95", field: "duration" }
    }
    case "uniq":
      return { measure: "distinct_attr", field: spec.measure.field }
    case "avg_attr":
      return { measure: "avg", field: spec.measure.field }
    case "sum_attr":
      return { measure: "sum", field: spec.measure.field }
    case "count_if":
      return { measure: "count" }
    default:
      return { measure: "rate" }
  }
}

function vizFromInsight(kind: InsightSpec["kind"]): TrendsVizKind {
  if (kind === "area") return "area"
  if (kind === "bar") return "bar"
  if (kind === "number") return "number"
  if (kind === "table") return "table"
  return "line"
}

function signalFromInsight(source: InsightSpec["source"]): TrendsSignal {
  return source === "logs" ? "logs" : "spans"
}

/** Convert InsightSpec (v2 or legacy-parsed) into TrendsQuery. */
export function migrateInsightToTrends(raw: unknown): TrendsQuery {
  // Already a TrendsQuery?
  if (
    raw &&
    typeof raw === "object" &&
    (raw as { version?: number }).version === 1 &&
    "series" in (raw as object)
  ) {
    const parsed = trendsQuerySchema.safeParse(raw)
    if (parsed.success) return parsed.data
  }

  let spec: InsightSpec
  try {
    spec = insightSpecSchema.parse(raw) as InsightSpec
  } catch {
    return defaultTrendsQuery()
  }

  const { measure, field } = measureFromInsight(spec)
  const filters = [...(spec.filters ?? [])]
  if (spec.measure.type === "count_if") {
    filters.push({
      key: spec.measure.field,
      op: spec.measure.op,
      value: spec.measure.value,
    })
  }

  const series: SeriesDef = {
    id: "migrated-a",
    letter: "A",
    label: undefined,
    signal: signalFromInsight(spec.source),
    measure,
    field,
    filters,
  }

  const root = emptyFilterGroup()
  // Put insight filters on series; leave global empty unless we want both

  const q: TrendsQuery = {
    version: 1,
    analysis: "trends",
    series: [series],
    formulas: [],
    filters: root,
    breakdowns: spec.breakdown
      ? [
          {
            field: spec.breakdown.field,
            topN: spec.breakdown.topN ?? 25,
            rankBy: "count",
            otherBucket: true,
          },
        ]
      : [],
    time: { kind: "preset", preset: "1h" },
    interval: "auto",
    baseline: { mode: "none" },
    viz: {
      kind: vizFromInsight(spec.kind),
      options: {
        stacked: spec.display?.stacked,
        fill: spec.display?.fill ?? spec.kind === "area",
        unit: spec.display?.unit,
        showLegend: spec.display?.legend,
      },
      referenceLines: [],
    },
  }
  return q
}

/** Detect whether stored JSON is TrendsQuery v1. */
export function isTrendsQueryJson(raw: unknown): boolean {
  return (
    !!raw &&
    typeof raw === "object" &&
    (raw as { version?: number }).version === 1 &&
    Array.isArray((raw as { series?: unknown }).series)
  )
}
