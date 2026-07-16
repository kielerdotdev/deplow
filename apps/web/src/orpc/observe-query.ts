import { ORPCError } from "@orpc/server"
import {
  and,
  eq,
  inArray,
  messageChannels,
  observeAlerts,
  observeDashboards,
  observeInsights,
  observeMembers,
  observeProjects,
  observeSavedViews,
} from "@deplow/db"
import {
  attributeAnomalies,
  durationHeatmap,
  getTrace,
  listOperationsRed,
  listReleases,
  listServicesRed,
  listTraces,
  logsHistogram,
  metricSeries,
  overviewRed,
  recentErrorTraces,
  runTrends,
  suggestFields,
  suggestFieldValues,
  trendsResultToCsv,
  searchLogs,
  selectionCounts,
  type SpanFilter,
} from "@deplow/observe"
import { randomUUID } from "node:crypto"
import * as z from "zod"

import { assertProjectAccess } from "@/lib/access"
import { env } from "@/lib/env"
import { db } from "@/lib/services"
import {
  ensureObserveReady,
  observeClickHouseConfig,
} from "@/lib/observe/store"
import {
  isLegacyDashboardLayout,
  migrateLegacyInsightSpec,
  parseDashboardLayout,
  parseLegacyPanels,
  serializeDashboardLayout,
  type DashboardLayout,
  type InsightSpec,
} from "@/lib/observe/insights"
import {
  migrateInsightToTrends,
  toTrendsQueryRun,
  trendsQuerySchema,
  type TrendsQuery,
} from "@/lib/observe/trends"

import { authedProcedure } from "./middleware"

function requireObserve() {
  if (!env.observeEnabled) {
    throw new ORPCError("NOT_FOUND", { message: "Observe is not enabled" })
  }
}

const filterOpSchema = z.enum([
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

const contextInputSchema = z.object({
  projectId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  service: z.string().optional(),
  operation: z.string().optional(),
  release: z.string().optional(),
  environment: z.string().optional(),
  q: z.string().optional(),
  filters: z
    .array(
      z.object({
        key: z.string(),
        op: filterOpSchema,
        value: z.string().optional(),
      }),
    )
    .optional(),
  durationMsMin: z.number().optional(),
  durationMsMax: z.number().optional(),
  statusError: z.boolean().optional(),
})

function toFilter(input: z.infer<typeof contextInputSchema>): SpanFilter {
  return {
    projectId: input.projectId,
    from: new Date(input.from),
    to: new Date(input.to),
    service: input.service,
    operation: input.operation,
    release: input.release,
    environment: input.environment,
    q: input.q,
    attributeFilters: input.filters,
    durationMsMin: input.durationMsMin,
    durationMsMax: input.durationMsMax,
    statusError: input.statusError,
  }
}

async function readyOrThrow() {
  const ready = await ensureObserveReady()
  if (!ready.ok) {
    throw new ORPCError("FAILED_PRECONDITION", { message: ready.detail })
  }
}

async function getObserveProject(projectId: string) {
  const [op] = await db
    .select()
    .from(observeProjects)
    .where(eq(observeProjects.projectId, projectId))
    .limit(1)
  return op ?? null
}

const ROLE_RANK = { viewer: 1, editor: 2, admin: 3, owner: 4 } as const

export async function assertObserveRole(
  projectId: string,
  userId: string,
  minRole: keyof typeof ROLE_RANK,
) {
  const op = await getObserveProject(projectId)
  if (!op) return // project access already checked; no observe members yet → allow
  const [member] = await db
    .select()
    .from(observeMembers)
    .where(
      and(
        eq(observeMembers.observeProjectId, op.id),
        eq(observeMembers.userId, userId),
      ),
    )
    .limit(1)
  if (!member) return // default: project members inherit editor-equivalent until assigned
  if (ROLE_RANK[member.role] < ROLE_RANK[minRole]) {
    throw new ORPCError("FORBIDDEN", {
      message: `Requires Observe role ${minRole} or higher`,
    })
  }
}

export const servicesList = authedProcedure
  .input(contextInputSchema)
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await readyOrThrow()
    return listServicesRed(observeClickHouseConfig(), toFilter(input))
  })

export const servicesOverview = authedProcedure
  .input(contextInputSchema)
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await readyOrThrow()
    return overviewRed(observeClickHouseConfig(), toFilter(input))
  })

export const servicesOperations = authedProcedure
  .input(contextInputSchema.extend({ service: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await readyOrThrow()
    return listOperationsRed(observeClickHouseConfig(), {
      ...toFilter(input),
      service: input.service,
    })
  })

export const servicesRecentErrors = authedProcedure
  .input(contextInputSchema.extend({ service: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await readyOrThrow()
    return recentErrorTraces(
      observeClickHouseConfig(),
      { ...toFilter(input), service: input.service },
      15,
    )
  })

export const tracesList = authedProcedure
  .input(contextInputSchema.extend({ limit: z.number().int().min(1).max(200).optional() }))
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await readyOrThrow()
    return listTraces(observeClickHouseConfig(), toFilter(input), input.limit ?? 50)
  })

export const tracesGet = authedProcedure
  .input(z.object({ projectId: z.string().uuid(), traceId: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await readyOrThrow()
    const spans = await getTrace(
      observeClickHouseConfig(),
      input.projectId,
      input.traceId,
    )
    return { spans, partial: spans.length >= 5000, sampled: false }
  })

export const logsSearch = authedProcedure
  .input(
    contextInputSchema.extend({
      traceId: z.string().optional(),
      spanId: z.string().optional(),
      severity: z.string().optional(),
      limit: z.number().int().optional(),
      offset: z.number().int().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await readyOrThrow()
    return searchLogs(observeClickHouseConfig(), {
      projectId: input.projectId,
      from: new Date(input.from),
      to: new Date(input.to),
      service: input.service,
      traceId: input.traceId,
      spanId: input.spanId,
      severity: input.severity,
      q: input.q,
      limit: input.limit,
      offset: input.offset,
    })
  })

export const logsHistogramQuery = authedProcedure
  .input(contextInputSchema)
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await readyOrThrow()
    return logsHistogram(observeClickHouseConfig(), {
      projectId: input.projectId,
      from: new Date(input.from),
      to: new Date(input.to),
      service: input.service,
      q: input.q,
    })
  })

export const chartsSeries = authedProcedure
  .input(
    contextInputSchema.extend({
      metric: z.enum([
        "rate",
        "errors",
        "duration_p95",
        "duration_p50",
        "duration_p99",
        "count",
      ]),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await readyOrThrow()
    const f = toFilter(input)
    return metricSeries(observeClickHouseConfig(), f, input.metric)
  })

export const exploreHeatmap = authedProcedure
  .input(contextInputSchema)
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await readyOrThrow()
    return durationHeatmap(observeClickHouseConfig(), toFilter(input))
  })

export const exploreSelection = authedProcedure
  .input(
    z.object({
      selected: contextInputSchema,
      baseline: contextInputSchema.optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.selected.projectId, context.session)
    await readyOrThrow()
    return selectionCounts(
      observeClickHouseConfig(),
      toFilter(input.selected),
      input.baseline ? toFilter(input.baseline) : null,
    )
  })

export const exploreAnomalies = authedProcedure
  .input(
    z.object({
      selected: contextInputSchema,
      baseline: contextInputSchema,
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.selected.projectId, context.session)
    await readyOrThrow()
    return attributeAnomalies(
      observeClickHouseConfig(),
      toFilter(input.selected),
      toFilter(input.baseline),
    )
  })

export const releasesList = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      from: z.string(),
      to: z.string(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await readyOrThrow()
    return listReleases(
      observeClickHouseConfig(),
      input.projectId,
      new Date(input.from),
      new Date(input.to),
    )
  })

export const savedViewsList = authedProcedure
  .input(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    const op = await getObserveProject(input.projectId)
    if (!op) return []
    const rows = await db
      .select()
      .from(observeSavedViews)
      .where(eq(observeSavedViews.observeProjectId, op.id))
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      surface: r.surface,
      contextJson: r.contextJson,
      createdAt: r.createdAt.toISOString(),
    }))
  })

export const savedViewsCreate = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      name: z.string().min(1).max(120),
      surface: z.string().default("explore"),
      contextJson: z.string().min(2),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await assertObserveRole(input.projectId, context.session.user.id, "editor")
    const op = await getObserveProject(input.projectId)
    if (!op) throw new ORPCError("NOT_FOUND", { message: "Observe project missing" })
    const id = randomUUID()
    await db.insert(observeSavedViews).values({
      id,
      observeProjectId: op.id,
      name: input.name,
      surface: input.surface,
      contextJson: input.contextJson,
      createdBy: context.session.user.id,
    })
    return { id }
  })

export const dashboardsList = authedProcedure
  .input(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    const op = await getObserveProject(input.projectId)
    if (!op) return []
    const rows = await db
      .select()
      .from(observeDashboards)
      .where(eq(observeDashboards.observeProjectId, op.id))
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      template: r.template,
      layoutJson: r.layoutJson,
      layout: parseDashboardLayout(r.layoutJson),
    }))
  })

async function seedServiceOverviewInsights(observeProjectId: string) {
  const defs: Array<{ name: string; spec: InsightSpec }> = [
    {
      name: "Request rate",
      spec: {
        version: 2,
        source: "spans",
        kind: "area",
        measure: { type: "rate" },
      },
    },
    {
      name: "Errors",
      spec: {
        version: 2,
        source: "spans",
        kind: "bar",
        measure: { type: "errors" },
      },
    },
    {
      name: "p95 latency",
      spec: {
        version: 2,
        source: "spans",
        kind: "line",
        measure: { type: "duration_quantile", quantile: 0.95 },
        display: { unit: "ms" },
      },
    },
  ]
  const widgets: DashboardLayout["widgets"] = []
  for (const def of defs) {
    const insightId = randomUUID()
    await db.insert(observeInsights).values({
      id: insightId,
      observeProjectId,
      name: def.name,
      description: null,
      specJson: JSON.stringify(def.spec),
    })
    widgets.push({
      id: randomUUID(),
      insightId,
      title: def.name,
      colSpan: 1,
    })
  }
  return { widgets }
}

async function migrateLegacyDashboardLayout(
  dashboardId: string,
  observeProjectId: string,
  layoutJson: string,
): Promise<DashboardLayout> {
  if (!isLegacyDashboardLayout(layoutJson)) {
    return parseDashboardLayout(layoutJson)
  }
  const panels = parseLegacyPanels(layoutJson)
  const widgets: DashboardLayout["widgets"] = []
  for (const panel of panels) {
    const spec = migrateLegacyInsightSpec({
      kind: panel.kind,
      metric: panel.metric,
    })
    const insightId = randomUUID()
    const name = panel.title ?? panel.id
    await db.insert(observeInsights).values({
      id: insightId,
      observeProjectId,
      name,
      description: "Migrated from legacy dashboard panel",
      specJson: JSON.stringify(spec),
    })
    widgets.push({
      id: panel.id || randomUUID(),
      insightId,
      title: name,
      colSpan: 1,
    })
  }
  const layout: DashboardLayout = { widgets }
  await db
    .update(observeDashboards)
    .set({ layoutJson: serializeDashboardLayout(layout) })
    .where(eq(observeDashboards.id, dashboardId))
  return layout
}

export const dashboardsCreate = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      name: z.string().min(1),
      template: z.enum(["blank", "service-overview"]).default("blank"),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await assertObserveRole(input.projectId, context.session.user.id, "editor")
    const op = await getObserveProject(input.projectId)
    if (!op) {
      throw new ORPCError("FAILED_PRECONDITION", {
        message: "Enable Observe for this project first",
      })
    }
    const id = randomUUID()
    let layout: DashboardLayout = { widgets: [] }
    if (input.template === "service-overview") {
      layout = await seedServiceOverviewInsights(op.id)
    }
    await db.insert(observeDashboards).values({
      id,
      observeProjectId: op.id,
      name: input.name,
      template: input.template,
      layoutJson: serializeDashboardLayout(layout),
    })
    return { id }
  })

export const dashboardsGet = authedProcedure
  .input(z.object({ projectId: z.string().uuid(), dashboardId: z.string().uuid() }))
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    const [row] = await db
      .select()
      .from(observeDashboards)
      .where(eq(observeDashboards.id, input.dashboardId))
      .limit(1)
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Dashboard not found" })
    const layout = await migrateLegacyDashboardLayout(
      row.id,
      row.observeProjectId,
      row.layoutJson,
    )
    const insightIds = layout.widgets.map((w) => w.insightId)
    const insights =
      insightIds.length === 0
        ? []
        : await db
            .select()
            .from(observeInsights)
            .where(inArray(observeInsights.id, insightIds))
    return {
      id: row.id,
      name: row.name,
      template: row.template,
      layoutJson: serializeDashboardLayout(layout),
      layout,
      insights: insights.map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        spec: migrateInsightToTrends(JSON.parse(i.specJson)),
      })),
    }
  })

export const dashboardsUpdate = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      dashboardId: z.string().uuid(),
      name: z.string().min(1).optional(),
      layout: z
        .object({
          widgets: z.array(
            z.object({
              id: z.string().min(1),
              insightId: z.string().uuid(),
              title: z.string().optional(),
              colSpan: z.union([z.literal(1), z.literal(2)]).optional(),
            }),
          ),
          defaults: z
            .object({
              time: z.any().optional(),
              groupBy: z.string().min(1).max(200).optional(),
            })
            .optional(),
        })
        .optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await assertObserveRole(input.projectId, context.session.user.id, "editor")
    const [row] = await db
      .select()
      .from(observeDashboards)
      .where(eq(observeDashboards.id, input.dashboardId))
      .limit(1)
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Dashboard not found" })
    const patch: { name?: string; layoutJson?: string } = {}
    if (input.name) patch.name = input.name
    if (input.layout) {
      patch.layoutJson = serializeDashboardLayout(
        parseDashboardLayout(JSON.stringify(input.layout)),
      )
    }
    if (Object.keys(patch).length > 0) {
      await db
        .update(observeDashboards)
        .set(patch)
        .where(eq(observeDashboards.id, input.dashboardId))
    }
    return { ok: true as const }
  })

export const dashboardsDelete = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      dashboardId: z.string().uuid(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await assertObserveRole(input.projectId, context.session.user.id, "editor")
    await db
      .delete(observeDashboards)
      .where(eq(observeDashboards.id, input.dashboardId))
    return { ok: true as const }
  })

function mapInsightRow(row: typeof observeInsights.$inferSelect) {
  let raw: unknown
  try {
    raw = JSON.parse(row.specJson)
  } catch {
    raw = {}
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    spec: migrateInsightToTrends(raw),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export const insightsList = authedProcedure
  .input(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    const op = await getObserveProject(input.projectId)
    if (!op) return []
    const rows = await db
      .select()
      .from(observeInsights)
      .where(eq(observeInsights.observeProjectId, op.id))
    return rows.map(mapInsightRow)
  })

export const insightsGet = authedProcedure
  .input(z.object({ projectId: z.string().uuid(), insightId: z.string().uuid() }))
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    const [row] = await db
      .select()
      .from(observeInsights)
      .where(eq(observeInsights.id, input.insightId))
      .limit(1)
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Insight not found" })
    return mapInsightRow(row)
  })

export const insightsCreate = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      name: z.string().min(1).max(120),
      description: z.string().max(500).optional(),
      /** TrendsQuery v1 or legacy InsightSpec — stored as TrendsQuery */
      spec: z.unknown(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await assertObserveRole(input.projectId, context.session.user.id, "editor")
    const op = await getObserveProject(input.projectId)
    if (!op) {
      throw new ORPCError("FAILED_PRECONDITION", {
        message: "Enable Observe for this project first",
      })
    }
    const id = randomUUID()
    const spec = migrateInsightToTrends(input.spec)
    await db.insert(observeInsights).values({
      id,
      observeProjectId: op.id,
      name: input.name,
      description: input.description ?? null,
      specJson: JSON.stringify(spec),
    })
    return { id }
  })

export const insightsUpdate = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      insightId: z.string().uuid(),
      name: z.string().min(1).max(120).optional(),
      description: z.string().max(500).nullable().optional(),
      spec: z.unknown().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await assertObserveRole(input.projectId, context.session.user.id, "editor")
    const patch: {
      name?: string
      description?: string | null
      specJson?: string
    } = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.description !== undefined) patch.description = input.description
    if (input.spec !== undefined) {
      patch.specJson = JSON.stringify(migrateInsightToTrends(input.spec))
    }
    if (Object.keys(patch).length > 0) {
      await db
        .update(observeInsights)
        .set(patch)
        .where(eq(observeInsights.id, input.insightId))
    }
    return { ok: true as const }
  })

export const insightsDelete = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      insightId: z.string().uuid(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await assertObserveRole(input.projectId, context.session.user.id, "editor")
    await db
      .delete(observeInsights)
      .where(eq(observeInsights.id, input.insightId))
    return { ok: true as const }
  })

export const insightsRun = authedProcedure
  .input(
    contextInputSchema.extend({
      insightId: z.string().uuid().optional(),
      spec: z.unknown().optional(),
      groupByOverride: z.string().min(1).max(200).nullable().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await readyOrThrow()

    let trends: TrendsQuery
    if (input.spec !== undefined) {
      trends = migrateInsightToTrends(input.spec)
    } else if (input.insightId) {
      const [row] = await db
        .select()
        .from(observeInsights)
        .where(eq(observeInsights.id, input.insightId))
        .limit(1)
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Insight not found" })
      trends = migrateInsightToTrends(JSON.parse(row.specJson))
    } else {
      throw new ORPCError("BAD_REQUEST", {
        message: "insightId or spec required",
      })
    }

    // Merge context time into query if caller passed from/to
    const runQuery = {
      ...trends,
      time: {
        kind: "absolute" as const,
        from: new Date(input.from).toISOString(),
        to: new Date(input.to).toISOString(),
      },
    }

    const cfg = observeClickHouseConfig()
    try {
      return await runTrends(
        cfg,
        toTrendsQueryRun(runQuery),
        {
          projectId: input.projectId,
          from: new Date(input.from),
          to: new Date(input.to),
        },
        {
          breakdownOverride:
            input.groupByOverride === undefined
              ? undefined
              : input.groupByOverride,
        },
      )
    } catch (err) {
      throw new ORPCError("BAD_REQUEST", {
        message: err instanceof Error ? err.message : "Insight query failed",
      })
    }
  })

export const trendsRun = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      query: trendsQuerySchema,
      /** Optional dashboard Context overrides */
      from: z.string().optional(),
      to: z.string().optional(),
      groupByOverride: z.string().min(1).max(200).nullable().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await readyOrThrow()

    const query = trendsQuerySchema.parse(input.query)
    let from: Date
    let to: Date
    if (input.from && input.to) {
      from = new Date(input.from)
      to = new Date(input.to)
    } else if (query.time.kind === "absolute") {
      from = new Date(query.time.from)
      to = new Date(query.time.to)
    } else {
      const { resolveTimeRange } = await import("@/lib/observe/context")
      const r = resolveTimeRange(query.time)
      from = r.from
      to = r.to
    }

    const cfg = observeClickHouseConfig()
    try {
      return await runTrends(
        cfg,
        toTrendsQueryRun(query),
        { projectId: input.projectId, from, to },
        {
          breakdownOverride:
            input.groupByOverride === undefined
              ? undefined
              : input.groupByOverride,
        },
      )
    } catch (err) {
      throw new ORPCError("BAD_REQUEST", {
        message: err instanceof Error ? err.message : "Trends query failed",
      })
    }
  })

export const trendsExport = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      query: trendsQuerySchema,
      format: z.enum(["csv", "json"]).default("csv"),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await readyOrThrow()

    const query = trendsQuerySchema.parse(input.query)
    let from: Date
    let to: Date
    if (input.from && input.to) {
      from = new Date(input.from)
      to = new Date(input.to)
    } else if (query.time.kind === "absolute") {
      from = new Date(query.time.from)
      to = new Date(query.time.to)
    } else {
      const { resolveTimeRange } = await import("@/lib/observe/context")
      const r = resolveTimeRange(query.time)
      from = r.from
      to = r.to
    }

    const cfg = observeClickHouseConfig()
    try {
      const result = await runTrends(
        cfg,
        toTrendsQueryRun(query),
        { projectId: input.projectId, from, to },
      )
      if (input.format === "json") {
        return {
          format: "json" as const,
          body: JSON.stringify({ query, result }, null, 2),
          mime: "application/json",
        }
      }
      return {
        format: "csv" as const,
        body: trendsResultToCsv(result),
        mime: "text/csv",
      }
    } catch (err) {
      throw new ORPCError("BAD_REQUEST", {
        message: err instanceof Error ? err.message : "Trends export failed",
      })
    }
  })

export const alertsList = authedProcedure
  .input(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    const op = await getObserveProject(input.projectId)
    if (!op) return []
    const rows = await db
      .select()
      .from(observeAlerts)
      .where(eq(observeAlerts.observeProjectId, op.id))
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      kind: r.kind,
      metric: r.metric,
      operator: r.operator,
      threshold: r.threshold,
      window: r.window,
      channelEmail: r.channelEmail,
      channelWebhook: r.channelWebhook,
      lastTriggeredAt: r.lastTriggeredAt?.toISOString() ?? null,
      contextJson: r.contextJson,
    }))
  })

export const alertsCreate = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      name: z.string().min(1),
      kind: z.enum(["threshold", "relative"]).default("threshold"),
      metric: z.string().default("error_rate"),
      operator: z.string().default("gt"),
      threshold: z.string(),
      window: z.string().default("5m"),
      channelEmail: z.string().email().optional(),
      channelWebhook: z.string().url().optional(),
      channelIds: z.array(z.string().uuid()).optional(),
      contextJson: z.string().default("{}"),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await assertObserveRole(input.projectId, context.session.user.id, "editor")
    const op = await getObserveProject(input.projectId)
    if (!op) {
      throw new ORPCError("FAILED_PRECONDITION", {
        message: "Enable Observe for this project first",
      })
    }
    const channelIds = input.channelIds ?? []
    if (
      channelIds.length === 0 &&
      !input.channelEmail &&
      !input.channelWebhook
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Provide notification channelIds and/or legacy email/webhook",
      })
    }
    const id = randomUUID()
    await db.insert(observeAlerts).values({
      id,
      observeProjectId: op.id,
      name: input.name,
      kind: input.kind,
      metric: input.metric,
      operator: input.operator,
      threshold: input.threshold,
      window: input.window,
      channelEmail: input.channelEmail,
      channelWebhook: input.channelWebhook,
      channelIdsJson: JSON.stringify(channelIds),
      contextJson: input.contextJson,
    })
    return { id }
  })

export const fieldsSuggest = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      q: z.string().optional(),
      signal: z.enum(["spans", "logs"]).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await readyOrThrow()
    const to = input.to ? new Date(input.to) : new Date()
    const from = input.from
      ? new Date(input.from)
      : new Date(to.getTime() - 24 * 3600_000)
    return suggestFields(observeClickHouseConfig(), {
      projectId: input.projectId,
      from,
      to,
      signal: input.signal,
      q: input.q,
    })
  })

export const fieldsValues = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      field: z.string().min(1),
      q: z.string().optional(),
      signal: z.enum(["spans", "logs"]).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await readyOrThrow()
    const to = input.to ? new Date(input.to) : new Date()
    const from = input.from
      ? new Date(input.from)
      : new Date(to.getTime() - 24 * 3600_000)
    return suggestFieldValues(observeClickHouseConfig(), {
      projectId: input.projectId,
      field: input.field,
      from,
      to,
      signal: input.signal,
      q: input.q,
    })
  })

const channelKindSchema = z.enum(["slack", "discord", "webhook", "email"])

export const messageChannelsList = authedProcedure.handler(
  async ({ context }) => {
    if (!context.session) throw new ORPCError("UNAUTHORIZED")
    const rows = await db.select().from(messageChannels)
    return rows.map((r) => {
      let config: Record<string, unknown> = {}
      try {
        config = JSON.parse(r.configJson) as Record<string, unknown>
      } catch {
        /* ignore */
      }
      return {
        id: r.id,
        name: r.name,
        kind: r.kind as z.infer<typeof channelKindSchema>,
        config,
        enabled: r.enabled,
      }
    })
  },
)

export const messageChannelsCreate = authedProcedure
  .input(
    z.object({
      name: z.string().min(1).max(120),
      kind: channelKindSchema,
      config: z.object({
        url: z.string().url().optional(),
        email: z.string().email().optional(),
      }),
    }),
  )
  .handler(async ({ context, input }) => {
    if (!context.session) throw new ORPCError("UNAUTHORIZED")
    if (input.kind === "email") {
      if (!input.config.email) {
        throw new ORPCError("BAD_REQUEST", { message: "email required" })
      }
    } else if (!input.config.url) {
      throw new ORPCError("BAD_REQUEST", { message: "url required" })
    }
    const id = randomUUID()
    await db.insert(messageChannels).values({
      id,
      name: input.name,
      kind: input.kind,
      configJson: JSON.stringify(input.config),
      createdBy: context.session.user.id,
    })
    return { id }
  })

export const messageChannelsDelete = authedProcedure
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, input }) => {
    if (!context.session) throw new ORPCError("UNAUTHORIZED")
    await db.delete(messageChannels).where(eq(messageChannels.id, input.id))
    return { ok: true as const }
  })

export const alertsUpdate = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      alertId: z.string().uuid(),
      enabled: z.boolean().optional(),
      name: z.string().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await assertObserveRole(input.projectId, context.session.user.id, "editor")
    await db
      .update(observeAlerts)
      .set({
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        updatedAt: new Date(),
      })
      .where(eq(observeAlerts.id, input.alertId))
    return { ok: true as const }
  })

export const membersList = authedProcedure
  .input(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    const op = await getObserveProject(input.projectId)
    if (!op) return []
    const rows = await db
      .select()
      .from(observeMembers)
      .where(eq(observeMembers.observeProjectId, op.id))
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      role: r.role,
    }))
  })

export const membersUpsert = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      userId: z.string().min(1),
      role: z.enum(["owner", "admin", "editor", "viewer"]),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await assertObserveRole(input.projectId, context.session.user.id, "admin")
    const op = await getObserveProject(input.projectId)
    if (!op) throw new ORPCError("NOT_FOUND", { message: "Observe project missing" })
    const [existing] = await db
      .select()
      .from(observeMembers)
      .where(
        and(
          eq(observeMembers.observeProjectId, op.id),
          eq(observeMembers.userId, input.userId),
        ),
      )
      .limit(1)
    if (existing) {
      await db
        .update(observeMembers)
        .set({ role: input.role })
        .where(eq(observeMembers.id, existing.id))
      return { id: existing.id }
    }
    const id = randomUUID()
    await db.insert(observeMembers).values({
      id,
      observeProjectId: op.id,
      userId: input.userId,
      role: input.role,
    })
    return { id }
  })

export const projectsUpdateRetention = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      retentionMaxEventCount: z.number().int().min(100).max(10_000_000).optional(),
      retentionMaxAgeDays: z.number().int().min(1).max(365).optional(),
      spanRetentionDays: z.number().int().min(1).max(90).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await assertObserveRole(input.projectId, context.session.user.id, "admin")
    const op = await getObserveProject(input.projectId)
    if (!op) throw new ORPCError("NOT_FOUND", { message: "Observe project missing" })
    await db
      .update(observeProjects)
      .set({
        ...(input.retentionMaxEventCount !== undefined
          ? { retentionMaxEventCount: input.retentionMaxEventCount }
          : {}),
        ...(input.retentionMaxAgeDays !== undefined
          ? { retentionMaxAgeDays: input.retentionMaxAgeDays }
          : {}),
        ...(input.spanRetentionDays !== undefined
          ? { spanRetentionDays: input.spanRetentionDays }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(observeProjects.id, op.id))
    return { ok: true as const }
  })

export const exportCsv = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      kind: z.enum(["services", "traces", "logs"]),
      from: z.string(),
      to: z.string(),
      service: z.string().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    await readyOrThrow()
    const cfg = observeClickHouseConfig()
    const filter = {
      projectId: input.projectId,
      from: new Date(input.from),
      to: new Date(input.to),
      service: input.service,
    }
    if (input.kind === "services") {
      const rows = await listServicesRed(cfg, filter)
      const header = "service,request_rate,error_rate,p95_ms,span_count"
      const body = rows
        .map(
          (r) =>
            `${r.service},${r.request_rate},${r.error_rate},${r.duration_p95_ms},${r.span_count}`,
        )
        .join("\n")
      return { csv: `${header}\n${body}`, sampled: false }
    }
    if (input.kind === "traces") {
      const rows = await listTraces(cfg, filter, 200)
      const header = "trace_id,service,root_name,duration_ms,status"
      const body = rows
        .map(
          (r) =>
            `${r.trace_id},${r.service},"${r.root_name.replace(/"/g, '""')}",${r.duration_ms},${r.status}`,
        )
        .join("\n")
      return { csv: `${header}\n${body}`, sampled: rows.length >= 200 }
    }
    const rows = await searchLogs(cfg, { ...filter, limit: 500 })
    const header = "timestamp,severity,service,body,trace_id"
    const body = rows
      .map(
        (r) =>
          `${r.timestamp},${r.severity},${r.service},"${r.body.replace(/"/g, '""')}",${r.trace_id}`,
      )
      .join("\n")
    return { csv: `${header}\n${body}`, sampled: rows.length >= 500 }
  })
