import fs from "node:fs/promises"
import path from "node:path"

import { and, desc, eq, isNull, sql } from "@deplow/db"
import {
  observeEventCountsHourly,
  observeGroupings,
  observeIssues,
  observeKeys,
  observeMembers,
  observeProjects,
  projects,
} from "@deplow/db"
import {
  buildDsn,
  deleteOldestEvents as chDeleteOldest,
  digestEventPayload,
  getClickHouse,
  getEvent,
  listEventsForIssue,
  migrateClickHouse,
  pingClickHouse,
  type ObserveClickHouseConfig,
} from "@deplow/observe"

import { env } from "@/lib/env"
import { db } from "@/lib/services"

export function observeClickHouseConfig(): ObserveClickHouseConfig {
  return {
    url: env.clickhouseUrl,
    database: env.clickhouseDatabase,
    username: env.clickhouseUser,
    password: env.clickhousePassword,
  }
}

let migrated = false

export async function ensureObserveReady(): Promise<{
  ok: boolean
  detail: string
}> {
  if (!env.observeEnabled) {
    return { ok: true, detail: "Observe disabled" }
  }
  const ping = await pingClickHouse(observeClickHouseConfig())
  if (!ping.ok) return ping
  if (!migrated) {
    try {
      await migrateClickHouse(observeClickHouseConfig())
      migrated = true
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      }
    }
  }
  return { ok: true, detail: "Observe ready" }
}

export async function findObserveProjectBySentryId(sentryId: number) {
  const [row] = await db
    .select()
    .from(observeProjects)
    .where(eq(observeProjects.sentryId, sentryId))
    .limit(1)
  return row ?? null
}

export async function findActiveKey(
  observeProjectId: string,
  publicKey: string,
) {
  const [row] = await db
    .select()
    .from(observeKeys)
    .where(
      and(
        eq(observeKeys.observeProjectId, observeProjectId),
        eq(observeKeys.publicKey, publicKey),
        isNull(observeKeys.revokedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

/** Ensure a user is an Observe member (idempotent upsert). */
export async function ensureObserveMember(
  observeProjectId: string,
  userId: string,
  role: "owner" | "admin" | "editor" | "viewer" = "owner",
) {
  const [existing] = await db
    .select()
    .from(observeMembers)
    .where(
      and(
        eq(observeMembers.observeProjectId, observeProjectId),
        eq(observeMembers.userId, userId),
      ),
    )
    .limit(1)
  if (existing) {
    if (existing.role !== role) {
      await db
        .update(observeMembers)
        .set({ role })
        .where(eq(observeMembers.id, existing.id))
    }
    return existing.id
  }
  const id = crypto.randomUUID()
  await db.insert(observeMembers).values({
    id,
    observeProjectId,
    userId,
    role,
  })
  return id
}

async function ensureProjectOwnerObserveMember(
  observeProjectId: string,
  projectId: string,
) {
  const [project] = await db
    .select({ ownerId: projects.ownerId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  if (!project?.ownerId) return
  await ensureObserveMember(observeProjectId, project.ownerId, "owner")
}

export async function enableObserveForProject(projectId: string) {
  const existing = await db
    .select()
    .from(observeProjects)
    .where(eq(observeProjects.projectId, projectId))
    .limit(1)
  if (existing[0]) {
    await ensureProjectOwnerObserveMember(existing[0].id, projectId)
    const [key] = await db
      .select()
      .from(observeKeys)
      .where(
        and(
          eq(observeKeys.observeProjectId, existing[0].id),
          isNull(observeKeys.revokedAt),
        ),
      )
      .limit(1)
    return { observeProject: existing[0], key: key ?? null }
  }

  const [{ maxId }] = await db
    .select({
      maxId: sql<number>`coalesce(max(${observeProjects.sentryId}), 0)`,
    })
    .from(observeProjects)
  const sentryId = Number(maxId) + 1
  const observeProjectId = crypto.randomUUID()
  const publicKey = crypto.randomUUID().replace(/-/g, "")
  const now = new Date()

  await db.insert(observeProjects).values({
    id: observeProjectId,
    projectId,
    sentryId,
    enabled: true,
    retentionMaxEventCount: env.observeDefaultMaxEvents,
    retentionMaxAgeDays: env.observeDefaultRetentionDays,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(observeKeys).values({
    id: crypto.randomUUID(),
    observeProjectId,
    publicKey,
    name: "default",
    createdAt: now,
  })
  await ensureProjectOwnerObserveMember(observeProjectId, projectId)

  const [observeProject] = await db
    .select()
    .from(observeProjects)
    .where(eq(observeProjects.id, observeProjectId))
    .limit(1)
  const [key] = await db
    .select()
    .from(observeKeys)
    .where(eq(observeKeys.observeProjectId, observeProjectId))
    .limit(1)

  return { observeProject: observeProject!, key: key! }
}

/** Project-scoped OTLP gateway URL (never raw otelcol). */
export function buildProjectOtelEndpoint(sentryId: number): string {
  return `${env.observeIngestUrl.replace(/\/$/, "")}/api/${sentryId}/otlp`
}

export function buildProjectDsn(sentryId: number, publicKey: string): string {
  const base = env.observeIngestUrl
  const u = new URL(base)
  return buildDsn({
    publicKey,
    host: u.host,
    sentryId,
    protocol: u.protocol.replace(":", ""),
  })
}

export async function stageEnvelopePayload(
  body: Buffer,
): Promise<{ stagingPath: string; ingestionId: string }> {
  const dir = env.observeStagingDir
  await fs.mkdir(dir, { recursive: true })
  const ingestionId = crypto.randomUUID()
  const stagingPath = path.join(dir, `${ingestionId}.bin`)
  await fs.writeFile(stagingPath, body)
  return { stagingPath, ingestionId }
}

export async function runObserveDigest(job: {
  sentryId: number
  eventId: string
  stagingPath: string
  receivedAt: string
}): Promise<void> {
  const observeProject = await findObserveProjectBySentryId(job.sentryId)
  if (!observeProject?.enabled) {
    await fs.unlink(job.stagingPath).catch(() => {})
    return
  }

  const raw = await fs.readFile(job.stagingPath, "utf8")
  const event = JSON.parse(raw) as Record<string, unknown>
  const ch = getClickHouse(observeClickHouseConfig())
  const receivedAt = new Date(job.receivedAt)

  await digestEventPayload(
    {
      ch,
      upsertGrouping: async (input) => {
        const [existing] = await db
          .select()
          .from(observeGroupings)
          .where(
            and(
              eq(observeGroupings.observeProjectId, input.observeProjectId),
              eq(observeGroupings.mechanism, input.mechanism),
              eq(observeGroupings.groupingKeyHash, input.groupingKeyHash),
            ),
          )
          .limit(1)

        if (existing) {
          const [proj] = await db
            .select()
            .from(observeProjects)
            .where(eq(observeProjects.id, input.observeProjectId))
            .limit(1)
          const digestOrder = (proj?.digestCounter ?? 0) + 1
          await db
            .update(observeProjects)
            .set({ digestCounter: digestOrder, updatedAt: new Date() })
            .where(eq(observeProjects.id, input.observeProjectId))
          return {
            issueId: existing.issueId,
            groupingId: existing.id,
            isNewIssue: false,
            digestOrder,
          }
        }

        const issueId = crypto.randomUUID()
        const groupingId = crypto.randomUUID()
        const now = new Date()
        await db.insert(observeIssues).values({
          id: issueId,
          observeProjectId: input.observeProjectId,
          title: input.title,
          culprit: input.culprit,
          level: input.level,
          status: "unresolved",
          digestedEventCount: 0,
          firstSeen: now,
          lastSeen: now,
          createdAt: now,
          updatedAt: now,
        })
        await db.insert(observeGroupings).values({
          id: groupingId,
          observeProjectId: input.observeProjectId,
          mechanism: input.mechanism,
          groupingKey: input.groupingKey,
          groupingKeyHash: input.groupingKeyHash,
          issueId,
          createdAt: now,
        })
        const [proj] = await db
          .select()
          .from(observeProjects)
          .where(eq(observeProjects.id, input.observeProjectId))
          .limit(1)
        const digestOrder = (proj?.digestCounter ?? 0) + 1
        await db
          .update(observeProjects)
          .set({ digestCounter: digestOrder, updatedAt: now })
          .where(eq(observeProjects.id, input.observeProjectId))
        return {
          issueId,
          groupingId,
          isNewIssue: true,
          digestOrder,
        }
      },
      bumpIssue: async ({ issueId, eventId, traceId, receivedAt: at }) => {
        const [issue] = await db
          .select()
          .from(observeIssues)
          .where(eq(observeIssues.id, issueId))
          .limit(1)
        await db
          .update(observeIssues)
          .set({
            digestedEventCount: (issue?.digestedEventCount ?? 0) + 1,
            lastSeen: at,
            lastEventId: eventId,
            lastTraceId: traceId || issue?.lastTraceId || null,
            updatedAt: at,
          })
          .where(eq(observeIssues.id, issueId))
      },
      bumpHourly: async ({ observeProjectId, issueId, hourIso }) => {
        await bumpCount("project", observeProjectId, hourIso)
        await bumpCount("issue", issueId, hourIso)
      },
      getStoredCount: async (observeProjectId) => {
        const [row] = await db
          .select()
          .from(observeProjects)
          .where(eq(observeProjects.id, observeProjectId))
          .limit(1)
        return row?.storedEventCount ?? 0
      },
      setStoredCount: async (observeProjectId, count) => {
        await db
          .update(observeProjects)
          .set({ storedEventCount: count, updatedAt: new Date() })
          .where(eq(observeProjects.id, observeProjectId))
      },
      deleteOldestEvents: async (projectId, deleteCount) => {
        await chDeleteOldest(ch, projectId, deleteCount)
      },
    },
    {
      projectId: observeProject.projectId,
      observeProjectId: observeProject.id,
      sentryId: observeProject.sentryId,
      retentionMaxEventCount: observeProject.retentionMaxEventCount,
    },
    event,
    receivedAt,
  )

  await fs.unlink(job.stagingPath).catch(() => {})
}

async function bumpCount(
  scope: "project" | "issue",
  scopeId: string,
  hourIso: string,
) {
  const [existing] = await db
    .select()
    .from(observeEventCountsHourly)
    .where(
      and(
        eq(observeEventCountsHourly.scope, scope),
        eq(observeEventCountsHourly.scopeId, scopeId),
        eq(observeEventCountsHourly.hour, hourIso),
      ),
    )
    .limit(1)
  if (existing) {
    await db
      .update(observeEventCountsHourly)
      .set({ count: existing.count + 1 })
      .where(eq(observeEventCountsHourly.id, existing.id))
  } else {
    await db.insert(observeEventCountsHourly).values({
      id: crypto.randomUUID(),
      scope,
      scopeId,
      hour: hourIso,
      count: 1,
    })
  }
}

export async function listIssuesForProject(
  projectId: string,
  status?: "unresolved" | "resolved" | "muted",
) {
  const [op] = await db
    .select()
    .from(observeProjects)
    .where(eq(observeProjects.projectId, projectId))
    .limit(1)
  if (!op) return []
  const conditions = [
    eq(observeIssues.observeProjectId, op.id),
    eq(observeIssues.isDeleted, false),
  ]
  if (status) conditions.push(eq(observeIssues.status, status))
  return db
    .select()
    .from(observeIssues)
    .where(and(...conditions))
    .orderBy(desc(observeIssues.lastSeen))
    .limit(100)
}

export async function getIssue(issueId: string) {
  const [issue] = await db
    .select()
    .from(observeIssues)
    .where(eq(observeIssues.id, issueId))
    .limit(1)
  return issue ?? null
}

export async function fetchEvent(projectId: string, eventId: string) {
  const ch = getClickHouse(observeClickHouseConfig())
  return getEvent(ch, projectId, eventId)
}

export async function fetchIssueEvents(projectId: string, issueId: string) {
  const ch = getClickHouse(observeClickHouseConfig())
  return listEventsForIssue(ch, projectId, issueId, 50)
}

export function buildObserveDeployEnv(input: {
  sentryId: number
  publicKey: string
  serviceName: string
  projectId: string
  serviceId: string
  release?: string
}): Record<string, string> {
  const dsn = buildProjectDsn(input.sentryId, input.publicKey)
  return {
    SENTRY_DSN: dsn,
    SENTRY_ENVIRONMENT: "production",
    ...(input.release ? { SENTRY_RELEASE: input.release } : {}),
    OTEL_SERVICE_NAME: input.serviceName,
    OTEL_RESOURCE_ATTRIBUTES: `deplow.project_id=${input.projectId},deplow.service_id=${input.serviceId},service.name=${input.serviceName}`,
    OTEL_EXPORTER_OTLP_ENDPOINT: buildProjectOtelEndpoint(input.sentryId),
    OTEL_EXPORTER_OTLP_HEADERS: `x-sentry-auth=sentry sentry_key=${input.publicKey}`,
    OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
  }
}
