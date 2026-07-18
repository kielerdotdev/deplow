import { ORPCError } from "@orpc/server"
import { and, eq, isNull, observeIssues, observeKeys, observeProjects } from "@deplow/db"
import { pingClickHouse } from "@deplow/observe"
import * as z from "zod"

import { assertProjectAccess } from "@/lib/access"
import { env } from "@/lib/env"
import { db } from "@/lib/services"
import {
  buildProjectDsn,
  buildProjectOtelEndpoint,
  enableObserveForProject,
  ensureObserveReady,
  fetchEvent,
  fetchIssueEvents,
  fetchIssueTrends,
  getIssue,
  listIssuesForProject,
  observeClickHouseConfig,
} from "@/lib/observe/store"
import {
  countEventsForIssueInRange,
  eventHistogramForIssue,
  getClickHouse,
} from "@deplow/observe"
import { resolveTimeRange } from "@/lib/observe/context"

import { authedProcedure } from "./middleware"

function requireObserve() {
  if (!env.observeEnabled) {
    throw new ORPCError("NOT_FOUND", { message: "Observe is not enabled" })
  }
}

export const status = authedProcedure.handler(async () => {
  if (!env.observeEnabled) {
    return {
      enabled: false as const,
      clickhouseOk: false,
      detail: "Set DEPLOW_OBSERVE_ENABLED=1 and start compose profile observe",
    }
  }
  const ready = await ensureObserveReady()
  const ping = await pingClickHouse(observeClickHouseConfig())
  return {
    enabled: true as const,
    clickhouseOk: ping.ok && ready.ok,
    detail: ready.ok ? ping.detail : ready.detail,
  }
})

export const projectsGet = authedProcedure
  .input(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    const [op] = await db
      .select()
      .from(observeProjects)
      .where(eq(observeProjects.projectId, input.projectId))
      .limit(1)
    if (!op) return { enabled: false as const, observe: null }
    const [key] = await db
      .select()
      .from(observeKeys)
      .where(
        and(
          eq(observeKeys.observeProjectId, op.id),
          isNull(observeKeys.revokedAt),
        ),
      )
      .limit(1)
    const dsn = key ? buildProjectDsn(op.sentryId, key.publicKey) : null
    return {
      enabled: true as const,
      observe: {
        sentryId: op.sentryId,
        dsn,
        retentionMaxEventCount: op.retentionMaxEventCount,
        storedEventCount: op.storedEventCount,
      },
    }
  })

export const projectsEnable = authedProcedure
  .input(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    const ready = await ensureObserveReady()
    if (!ready.ok) {
      throw new ORPCError("FAILED_PRECONDITION", {
        message: `ClickHouse not ready: ${ready.detail}`,
      })
    }
    const { observeProject, key } = await enableObserveForProject(
      input.projectId,
    )
    if (!key) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Observe key missing",
      })
    }
    return {
      sentryId: observeProject.sentryId,
      dsn: buildProjectDsn(observeProject.sentryId, key.publicKey),
      otelEndpoint: buildProjectOtelEndpoint(observeProject.sentryId),
    }
  })

export const projectsSetup = authedProcedure
  .input(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    const enabled = await enableObserveForProject(input.projectId)
    if (!enabled.key) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Observe key missing",
      })
    }
    const dsn = buildProjectDsn(
      enabled.observeProject.sentryId,
      enabled.key.publicKey,
    )
    const otelEndpoint = buildProjectOtelEndpoint(enabled.observeProject.sentryId)
    const snippet = `import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "${dsn}",
  environment: process.env.SENTRY_ENVIRONMENT ?? "production",
  tracesSampleRate: 0.1,
});
`
    return {
      dsn,
      otelEndpoint,
      otelHeaders: `x-sentry-auth=sentry sentry_key=${enabled.key.publicKey}`,
      snippet,
    }
  })

export const issuesList = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      status: z.enum(["unresolved", "resolved", "muted"]).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    const rows = await listIssuesForProject(input.projectId, input.status)
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      culprit: r.culprit,
      level: r.level,
      status: r.status,
      count: r.digestedEventCount,
      firstSeen: r.firstSeen.toISOString(),
      lastSeen: r.lastSeen.toISOString(),
      lastEventId: r.lastEventId,
      lastTraceId: r.lastTraceId,
      assigneeUserId: r.assigneeUserId ?? null,
      priority: r.priority ?? "medium",
      externalIssueUrl: r.externalIssueUrl ?? null,
    }))
  })

export const issuesGet = authedProcedure
  .input(z.object({ issueId: z.string().uuid() }))
  .handler(async ({ context, input }) => {
    requireObserve()
    const issue = await getIssue(input.issueId)
    if (!issue || issue.isDeleted) {
      throw new ORPCError("NOT_FOUND", { message: "Issue not found" })
    }
    const [op] = await db
      .select()
      .from(observeProjects)
      .where(eq(observeProjects.id, issue.observeProjectId))
      .limit(1)
    if (!op) throw new ORPCError("NOT_FOUND", { message: "Issue not found" })
    await assertProjectAccess(op.projectId, context.session)
    return {
      id: issue.id,
      projectId: op.projectId,
      title: issue.title,
      culprit: issue.culprit,
      level: issue.level,
      status: issue.status,
      count: issue.digestedEventCount,
      firstSeen: issue.firstSeen.toISOString(),
      lastSeen: issue.lastSeen.toISOString(),
      lastEventId: issue.lastEventId,
      lastTraceId: issue.lastTraceId,
      assigneeUserId: issue.assigneeUserId ?? null,
      priority: issue.priority ?? "medium",
      externalIssueUrl: issue.externalIssueUrl ?? null,
    }
  })

export const issuesUpdateTriage = authedProcedure
  .input(
    z.object({
      issueId: z.string().uuid(),
      assigneeUserId: z.string().nullable().optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      externalIssueUrl: z.string().url().nullable().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    const issue = await getIssue(input.issueId)
    if (!issue) throw new ORPCError("NOT_FOUND", { message: "Issue not found" })
    const [op] = await db
      .select()
      .from(observeProjects)
      .where(eq(observeProjects.id, issue.observeProjectId))
      .limit(1)
    if (!op) throw new ORPCError("NOT_FOUND", { message: "Issue not found" })
    await assertProjectAccess(op.projectId, context.session)
    await db
      .update(observeIssues)
      .set({
        ...(input.assigneeUserId !== undefined
          ? { assigneeUserId: input.assigneeUserId }
          : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.externalIssueUrl !== undefined
          ? { externalIssueUrl: input.externalIssueUrl }
          : {}),
        updatedAt: new Date(),
      })
    return { ok: true as const }
  })

export const issuesUpdateStatus = authedProcedure
  .input(
    z.object({
      issueId: z.string().uuid(),
      status: z.enum(["unresolved", "resolved", "muted"]),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    const issue = await getIssue(input.issueId)
    if (!issue) throw new ORPCError("NOT_FOUND", { message: "Issue not found" })
    const [op] = await db
      .select()
      .from(observeProjects)
      .where(eq(observeProjects.id, issue.observeProjectId))
      .limit(1)
    if (!op) throw new ORPCError("NOT_FOUND", { message: "Issue not found" })
    await assertProjectAccess(op.projectId, context.session)
    await db
      .update(observeIssues)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(observeIssues.id, input.issueId))
    return { ok: true as const }
  })

export const issuesBulkUpdateStatus = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      issueIds: z.array(z.string().uuid()).min(1).max(100),
      status: z.enum(["unresolved", "resolved", "muted"]),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    for (const issueId of input.issueIds) {
      const issue = await getIssue(issueId)
      if (!issue) continue
      await db
        .update(observeIssues)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(observeIssues.id, issueId))
    }
    return { ok: true as const, count: input.issueIds.length }
  })

export const eventsGet = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      eventId: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    const ready = await ensureObserveReady()
    if (!ready.ok) {
      throw new ORPCError("FAILED_PRECONDITION", { message: ready.detail })
    }
    const event = await fetchEvent(input.projectId, input.eventId)
    if (!event) {
      throw new ORPCError("NOT_FOUND", { message: "Event not found" })
    }
    return event
  })

export const eventsListForIssue = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      issueId: z.string().uuid(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    const ready = await ensureObserveReady()
    if (!ready.ok) {
      throw new ORPCError("FAILED_PRECONDITION", { message: ready.detail })
    }
    const events = await fetchIssueEvents(input.projectId, input.issueId)
    return events.map((e) => ({
      event_id: e.event_id,
      timestamp: e.timestamp,
      level: e.level,
      message: e.message,
      culprit: e.culprit,
      digest_order: e.digest_order,
      trace_id: e.trace_id,
    }))
  })

export const issuesTrend = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      issueIds: z.array(z.string().uuid()).min(1).max(100),
      hours: z.number().int().min(1).max(168).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    return fetchIssueTrends(input.issueIds, input.hours ?? 24)
  })

export const issuesEventHistogram = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      issueId: z.string().uuid(),
      from: z.string(),
      to: z.string(),
      bucketSeconds: z.number().int().min(60).max(86400).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    const ready = await ensureObserveReady()
    if (!ready.ok) {
      throw new ORPCError("FAILED_PRECONDITION", { message: ready.detail })
    }
    const ch = getClickHouse(observeClickHouseConfig())
    const from = new Date(input.from)
    const to = new Date(input.to)
    const [series, matchingCount] = await Promise.all([
      eventHistogramForIssue(
        ch,
        input.projectId,
        input.issueId,
        from,
        to,
        input.bucketSeconds ?? 3600,
      ),
      countEventsForIssueInRange(
        ch,
        input.projectId,
        input.issueId,
        from,
        to,
      ),
    ])
    return {
      series: series.map((s) => ({ t: s.t, v: s.count })),
      matchingCount,
    }
  })

/** Convenience: resolve Context preset range on the server for issue histogram. */
export const issuesEventSeries = authedProcedure
  .input(
    z.object({
      projectId: z.string().uuid(),
      issueId: z.string().uuid(),
      preset: z
        .enum([
          "1m",
          "5m",
          "15m",
          "1h",
          "6h",
          "12h",
          "24h",
          "7d",
          "14d",
          "30d",
        ])
        .optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    requireObserve()
    await assertProjectAccess(input.projectId, context.session)
    const ready = await ensureObserveReady()
    if (!ready.ok) {
      throw new ORPCError("FAILED_PRECONDITION", { message: ready.detail })
    }
    let from: Date
    let to: Date
    if (input.from && input.to) {
      from = new Date(input.from)
      to = new Date(input.to)
    } else {
      const r = resolveTimeRange({
        kind: "preset",
        preset: input.preset ?? "24h",
      })
      from = r.from
      to = r.to
    }
    const spanMs = to.getTime() - from.getTime()
    const bucketSeconds =
      spanMs <= 2 * 60 * 60_000
        ? 300
        : spanMs <= 24 * 60 * 60_000
          ? 3600
          : 6 * 3600
    const ch = getClickHouse(observeClickHouseConfig())
    const [series, matchingCount] = await Promise.all([
      eventHistogramForIssue(
        ch,
        input.projectId,
        input.issueId,
        from,
        to,
        bucketSeconds,
      ),
      countEventsForIssueInRange(
        ch,
        input.projectId,
        input.issueId,
        from,
        to,
      ),
    ])
    return {
      series: series.map((s) => ({ t: s.t, v: s.count })),
      matchingCount,
      from: from.toISOString(),
      to: to.toISOString(),
    }
  })
