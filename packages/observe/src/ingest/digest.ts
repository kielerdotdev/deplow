import type { ClickHouseClient } from "@clickhouse/client"

import { insertEvent, type ObserveEventRow } from "../clickhouse/events"
import { groupEvent } from "../grouping/v1"

export type DigestProject = {
  /** deplow projects.id */
  projectId: string
  observeProjectId: string
  sentryId: number
  retentionMaxEventCount: number
}

export type DigestDeps = {
  ch: ClickHouseClient
  /** Find grouping by hash; create issue+grouping if missing. Returns ids + whether issue is new. */
  upsertGrouping: (input: {
    observeProjectId: string
    mechanism: string
    groupingKey: string
    groupingKeyHash: string
    title: string
    culprit: string
    level: string
  }) => Promise<{
    issueId: string
    groupingId: string
    isNewIssue: boolean
    digestOrder: number
  }>
  bumpIssue: (input: {
    issueId: string
    eventId: string
    traceId: string
    receivedAt: Date
  }) => Promise<void>
  bumpHourly: (input: {
    observeProjectId: string
    issueId: string
    hourIso: string
  }) => Promise<void>
  getStoredCount: (observeProjectId: string) => Promise<number>
  setStoredCount: (observeProjectId: string, count: number) => Promise<void>
  deleteOldestEvents: (
    projectId: string,
    deleteCount: number,
  ) => Promise<void>
}

export async function digestEventPayload(
  deps: DigestDeps,
  project: DigestProject,
  event: Record<string, unknown>,
  receivedAt = new Date(),
): Promise<{ issueId: string; eventId: string }> {
  const grouped = groupEvent(event)
  const eventId =
    (typeof event.event_id === "string" && event.event_id) ||
    globalThis.crypto.randomUUID().replace(/-/g, "")

  const { issueId, groupingId, isNewIssue, digestOrder } =
    await deps.upsertGrouping({
      observeProjectId: project.observeProjectId,
      mechanism: grouped.mechanism,
      groupingKey: grouped.groupingKey,
      groupingKeyHash: grouped.groupingKeyHash,
      title: grouped.title,
      culprit: grouped.culprit,
      level: grouped.level,
    })

  const timestamp = parseEventTimestamp(event) ?? receivedAt
  const tags = normalizeTags(event.tags)

  const row: ObserveEventRow = {
    project_id: project.projectId,
    issue_id: issueId,
    grouping_id: groupingId,
    event_id: eventId,
    digest_order: digestOrder,
    timestamp: toChDateTime(timestamp),
    received: toChDateTime(receivedAt),
    level: grouped.level,
    environment: grouped.environment,
    release: grouped.release,
    dist: stringField(event.dist),
    platform: grouped.platform,
    transaction_name: grouped.transaction,
    message: grouped.message,
    culprit: grouped.culprit,
    trace_id: grouped.traceId,
    user_id: stringField((event.user as { id?: string } | undefined)?.id),
    never_evict: isNewIssue ? 1 : 0,
    irrelevance: 0,
    tags,
    fingerprint: grouped.fingerprint,
    exception_json: jsonSlice(event.exception),
    breadcrumbs_json: jsonSlice(event.breadcrumbs),
    contexts_json: jsonSlice(event.contexts),
    threads_json: jsonSlice(event.threads),
    raw_json: JSON.stringify(event).slice(0, 900_000),
  }

  await insertEvent(deps.ch, row)

  await deps.bumpIssue({
    issueId,
    eventId,
    traceId: grouped.traceId,
    receivedAt,
  })

  const hourIso = receivedAt.toISOString().slice(0, 13) + ":00:00.000Z"
  await deps.bumpHourly({
    observeProjectId: project.observeProjectId,
    issueId,
    hourIso,
  })

  const stored = (await deps.getStoredCount(project.observeProjectId)) + 1
  await deps.setStoredCount(project.observeProjectId, stored)

  const max = project.retentionMaxEventCount
  if (stored > max) {
    const overflow = stored - max
    await deps.deleteOldestEvents(project.projectId, overflow)
    await deps.setStoredCount(project.observeProjectId, max)
  }

  return { issueId, eventId }
}

function parseEventTimestamp(event: Record<string, unknown>): Date | null {
  const ts = event.timestamp
  if (typeof ts === "number") {
    // Sentry uses seconds
    return new Date(ts > 1e12 ? ts : ts * 1000)
  }
  if (typeof ts === "string") {
    const d = new Date(ts)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

function toChDateTime(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "")
}

function normalizeTags(tags: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!tags) return out
  if (Array.isArray(tags)) {
    for (const pair of tags) {
      if (Array.isArray(pair) && pair.length >= 2) {
        out[String(pair[0])] = String(pair[1]).slice(0, 200)
      }
    }
    return out
  }
  if (typeof tags === "object") {
    for (const [k, v] of Object.entries(tags as Record<string, unknown>)) {
      out[k] = String(v).slice(0, 200)
    }
  }
  return out
}

function jsonSlice(v: unknown): string {
  if (v === undefined || v === null) return ""
  try {
    return JSON.stringify(v).slice(0, 500_000)
  } catch {
    return ""
  }
}

function stringField(v: unknown): string {
  return typeof v === "string" ? v : ""
}
