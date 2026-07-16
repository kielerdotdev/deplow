import { z } from "zod"

import {
  filterClauseSchema,
  timeRangeSchema,
} from "@/lib/observe/context/types"

/** Known dimensions + free-form `attr:<key>` / bare attribute keys. */
export const breakdownFieldSchema = z.string().min(1).max(200)
export type BreakdownField = z.infer<typeof breakdownFieldSchema>

export const insightSourceSchema = z.enum(["spans", "logs"])
export type InsightSource = z.infer<typeof insightSourceSchema>

export const insightKindSchema = z.enum([
  "line",
  "bar",
  "area",
  "number",
  "table",
])
export type InsightKind = z.infer<typeof insightKindSchema>

export const insightMeasureSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("count") }),
  z.object({ type: z.literal("rate") }),
  z.object({ type: z.literal("errors") }),
  z.object({
    type: z.literal("duration_quantile"),
    quantile: z.number().min(0).max(1).default(0.95),
  }),
  z.object({
    type: z.literal("uniq"),
    /** Attribute or known field to count distinct values of */
    field: z.string().min(1).max(200),
  }),
  z.object({
    type: z.literal("avg_attr"),
    field: z.string().min(1).max(200),
  }),
  z.object({
    type: z.literal("sum_attr"),
    field: z.string().min(1).max(200),
  }),
  z.object({
    type: z.literal("count_if"),
    field: z.string().min(1).max(200),
    op: z
      .enum(["eq", "neq", "contains", "exists", "not_exists", "gt", "gte", "lt", "lte"])
      .default("eq"),
    value: z.string().optional(),
  }),
])
export type InsightMeasure = z.infer<typeof insightMeasureSchema>

export const insightDisplaySchema = z.object({
  stacked: z.boolean().optional(),
  fill: z.boolean().optional(),
  unit: z.string().max(32).optional(),
  label: z.string().max(120).optional(),
  legend: z.boolean().optional(),
})
export type InsightDisplay = z.infer<typeof insightDisplaySchema>

export const insightBreakdownSchema = z.object({
  field: breakdownFieldSchema,
  topN: z.number().int().min(1).max(25).default(8),
})
export type InsightBreakdown = z.infer<typeof insightBreakdownSchema>

const insightSpecV2Base = z.object({
  version: z.literal(2).default(2),
  source: insightSourceSchema.default("spans"),
  kind: insightKindSchema.default("line"),
  measure: insightMeasureSchema.default({ type: "rate" }),
  filters: z.array(filterClauseSchema).optional(),
  breakdown: insightBreakdownSchema.optional(),
  display: insightDisplaySchema.optional(),
  /**
   * Power-user escape hatch. Placeholders: {{project_id}}, {{from}}, {{to}}.
   * Must be a single SELECT returning columns t (unix ms or DateTime) and v,
   * optionally key for breakdowns.
   */
  rawSql: z.string().max(8000).optional(),
})

/** Legacy v1 shape kept for stored specs. */
const legacyInsightSpecSchema = z.object({
  kind: z.enum(["line", "bar", "number", "table"]).optional(),
  metric: z
    .enum(["rate", "errors", "duration_p50", "duration_p95", "duration_p99", "count"])
    .optional(),
  query: z
    .object({
      service: z.string().optional(),
      operation: z.string().optional(),
      release: z.string().optional(),
      environment: z.string().optional(),
      q: z.string().optional(),
    })
    .optional(),
  filters: z.array(filterClauseSchema).optional(),
  groupBy: z
    .enum(["service", "operation", "release", "environment", "status"])
    .optional(),
})

export function migrateLegacyInsightSpec(raw: unknown): z.infer<typeof insightSpecV2Base> {
  const legacy = legacyInsightSpecSchema.safeParse(raw)
  if (!legacy.success) {
    return {
      version: 2,
      source: "spans",
      kind: "line",
      measure: { type: "rate" },
    }
  }
  const l = legacy.data
  const filters = [...(l.filters ?? [])]
  if (l.query?.service) {
    filters.push({ key: "service", op: "eq", value: l.query.service })
  }
  if (l.query?.operation) {
    filters.push({ key: "operation", op: "eq", value: l.query.operation })
  }
  if (l.query?.release) {
    filters.push({ key: "release", op: "eq", value: l.query.release })
  }
  if (l.query?.environment) {
    filters.push({ key: "environment", op: "eq", value: l.query.environment })
  }
  if (l.query?.q) {
    filters.push({ key: "name", op: "contains", value: l.query.q })
  }

  let measure: InsightMeasure = { type: "rate" }
  switch (l.metric) {
    case "count":
      measure = { type: "count" }
      break
    case "errors":
      measure = { type: "errors" }
      break
    case "duration_p50":
      measure = { type: "duration_quantile", quantile: 0.5 }
      break
    case "duration_p95":
      measure = { type: "duration_quantile", quantile: 0.95 }
      break
    case "duration_p99":
      measure = { type: "duration_quantile", quantile: 0.99 }
      break
    case "rate":
    default:
      measure = { type: "rate" }
  }

  return {
    version: 2,
    source: "spans",
    kind: (l.kind as InsightKind | undefined) ?? "line",
    measure,
    filters: filters.length ? filters : undefined,
    breakdown: l.groupBy
      ? { field: l.groupBy, topN: 8 }
      : undefined,
  }
}

export const insightSpecSchema = z.preprocess((raw) => {
  if (raw && typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>
    if (obj.version === 2 || obj.measure) return raw
    if (obj.metric || obj.groupBy || obj.query) {
      return migrateLegacyInsightSpec(raw)
    }
  }
  return raw
}, insightSpecV2Base)

export type InsightSpec = z.infer<typeof insightSpecV2Base>

/** Allowlisted presets for UI; free-form still allowed via breakdown.field. */
export const insightGroupBySchema = z.enum([
  "service",
  "operation",
  "release",
  "environment",
  "status",
  "severity",
])
export type InsightGroupBy = z.infer<typeof insightGroupBySchema>

/** @deprecated use measure — kept for UI that still lists presets */
export const insightMetricSchema = z.enum([
  "rate",
  "errors",
  "duration_p50",
  "duration_p95",
  "duration_p99",
  "count",
])
export type InsightMetric = z.infer<typeof insightMetricSchema>

export const dashboardWidgetSchema = z.object({
  id: z.string().min(1),
  insightId: z.string().uuid(),
  title: z.string().optional(),
  colSpan: z.union([z.literal(1), z.literal(2)]).optional(),
})
export type DashboardWidget = z.infer<typeof dashboardWidgetSchema>

export const dashboardDefaultsSchema = z.object({
  time: timeRangeSchema.optional(),
  /** Free-form breakdown override for the whole dashboard */
  groupBy: z.string().min(1).max(200).optional(),
})
export type DashboardDefaults = z.infer<typeof dashboardDefaultsSchema>

export const dashboardLayoutSchema = z.object({
  widgets: z.array(dashboardWidgetSchema).default([]),
  defaults: dashboardDefaultsSchema.optional(),
})
export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>

const legacyPanelSchema = z.object({
  id: z.string(),
  kind: z.string(),
  metric: z.string(),
  title: z.string().optional(),
})

export function parseDashboardLayout(raw: string): DashboardLayout {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw || '{"widgets":[]}')
  } catch {
    return { widgets: [] }
  }
  if (Array.isArray(parsed)) {
    return { widgets: [] }
  }
  const result = dashboardLayoutSchema.safeParse(parsed)
  return result.success ? result.data : { widgets: [] }
}

export function isLegacyDashboardLayout(raw: string): boolean {
  try {
    return Array.isArray(JSON.parse(raw || "null"))
  } catch {
    return false
  }
}

export function parseLegacyPanels(
  raw: string,
): Array<{ id: string; kind: string; metric: string; title?: string }> {
  try {
    const parsed = JSON.parse(raw || "[]")
    const result = z.array(legacyPanelSchema).safeParse(parsed)
    return result.success ? result.data : []
  } catch {
    return []
  }
}

export function serializeDashboardLayout(layout: DashboardLayout): string {
  return JSON.stringify(dashboardLayoutSchema.parse(layout))
}

export function defaultInsightSpec(): InsightSpec {
  return {
    version: 2,
    source: "spans",
    kind: "line",
    measure: { type: "rate" },
  }
}

export function measureLabel(m: InsightMeasure): string {
  switch (m.type) {
    case "count":
      return "Count"
    case "rate":
      return "Rate (/s)"
    case "errors":
      return "Errors"
    case "duration_quantile":
      return `Duration p${Math.round(m.quantile * 100)}`
    case "uniq":
      return `Unique ${m.field}`
    case "avg_attr":
      return `Avg ${m.field}`
    case "sum_attr":
      return `Sum ${m.field}`
    case "count_if":
      return `Count if ${m.field}`
  }
}
