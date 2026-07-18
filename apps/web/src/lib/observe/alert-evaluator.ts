/**
 * In-process threshold alert evaluator.
 * Runs TelemetryQuery (or legacy metric) against ClickHouse and transitions
 * OK → Pending → Firing → Recovering → OK.
 */
import {
  eq,
  messageChannels,
  observeAlertHistory,
  observeAlerts,
  observeProjects,
  projects,
} from "@hostrig/db"
import {
  runTelemetryQuery,
  type TelemetryQuery,
} from "@hostrig/observe"
import { randomUUID } from "node:crypto"

import { db } from "@/lib/services"
import type { ChannelConfig } from "@/lib/message-channel-deliver"
import { observeClickHouseConfig } from "@/lib/observe/store"
import { parseStoredQuery } from "@/lib/observe/telemetry"

export type AlertState = "ok" | "pending" | "firing" | "recovering"

const WINDOW_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
}

function parseWindow(window: string): number {
  return WINDOW_MS[window] ?? 5 * 60_000
}

function compare(
  value: number,
  operator: string,
  threshold: number,
): boolean {
  switch (operator) {
    case "gt":
      return value > threshold
    case "gte":
      return value >= threshold
    case "lt":
      return value < threshold
    case "lte":
      return value <= threshold
    case "eq":
      return value === threshold
    default:
      return value > threshold
  }
}

function queryForAlert(alert: {
  metric: string
  window: string
  contextJson: string
}): TelemetryQuery {
  const stored = parseStoredQuery(alert.contextJson)
  const windowMs = parseWindow(alert.window)
  const to = new Date()
  const from = new Date(to.getTime() - windowMs)

  const aggFn =
    alert.metric === "error_rate"
      ? ("error_rate" as const)
      : alert.metric === "rate"
        ? ("rate" as const)
        : alert.metric === "duration_p95" || alert.metric === "p95"
          ? ("p95" as const)
          : alert.metric === "count"
            ? ("count" as const)
            : (stored.aggregation?.function ?? "count")

  return {
    ...stored,
    version: 1,
    timeRange: {
      kind: "absolute",
      from: from.toISOString(),
      to: to.toISOString(),
    },
    aggregation: {
      function: aggFn,
      field: stored.aggregation?.field ?? "duration",
      interval: "auto",
    },
    presentation: {
      ...stored.presentation,
      view: "timeseries",
      sort: stored.presentation?.sort ?? "newest",
    },
  }
}

function extractValue(result: Awaited<ReturnType<typeof runTelemetryQuery>>): number | null {
  if (result.kind === "timeseries" || result.kind === "table") {
    if (result.trends.number?.value != null) return result.trends.number.value
    const points = result.trends.points
    if (!points.length) return 0
    const last = points[points.length - 1]!
    const vals = Object.values(last.values).filter(
      (v): v is number => typeof v === "number",
    )
    if (!vals.length) return 0
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }
  if (result.kind === "traces") return result.rows.length
  if (result.kind === "list") return result.rows.length
  if (result.kind === "metrics" && result.series?.points.length) {
    const last = result.series.points[result.series.points.length - 1]!
    const vals = Object.values(last.values).filter(
      (v): v is number => typeof v === "number",
    )
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }
  return null
}

async function recordTransition(input: {
  alertId: string
  fromState: string
  toState: string
  value?: number | null
  threshold?: string
  message?: string
}) {
  await db.insert(observeAlertHistory).values({
    id: randomUUID(),
    alertId: input.alertId,
    fromState: input.fromState,
    toState: input.toState,
    value: input.value != null ? String(input.value) : null,
    threshold: input.threshold ?? null,
    message: input.message ?? null,
  })
}

async function deliverAlertNotification(input: {
  alertName: string
  projectName: string
  state: AlertState
  value: number
  threshold: string
  operator: string
  channelIds: string[]
  channelEmail?: string | null
  channelWebhook?: string | null
}) {
  const message = `[${input.state.toUpperCase()}] ${input.alertName} on ${input.projectName}: value ${input.value} ${input.operator} ${input.threshold}`

  if (input.channelIds.length) {
    const channels = await db
      .select()
      .from(messageChannels)
      .where(eq(messageChannels.enabled, true))
    for (const ch of channels) {
      if (!input.channelIds.includes(ch.id)) continue
      let config: ChannelConfig = {}
      try {
        const { decryptChannelConfigJson } = await import(
          "@/lib/message-channels"
        )
        const { platformConfig } = await import("@/lib/services")
        config = decryptChannelConfigJson(
          ch.configJson,
          platformConfig.secretsEncryptionKey,
        )
      } catch {
        continue
      }
      try {
        if (ch.kind === "email") continue
        const url = config.url?.trim()
        if (!url) continue
        const { safeOutboundFetch } = await import("@/lib/core/safe-fetch")
        const body =
          ch.kind === "slack"
            ? JSON.stringify({ text: message })
            : ch.kind === "discord"
              ? JSON.stringify({ content: message })
              : JSON.stringify({
                  event: "alert.transition",
                  message,
                  alert: input.alertName,
                  state: input.state,
                  value: input.value,
                  threshold: input.threshold,
                })
        await safeOutboundFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          timeoutMs: 8000,
          policy: { allowHttp: false, blockPrivate: true },
        })
      } catch {
        /* best-effort */
      }
    }
  }

  if (input.channelWebhook) {
    try {
      const { safeOutboundFetch } = await import("@/lib/core/safe-fetch")
      await safeOutboundFetch(input.channelWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "alert.transition",
          message,
          state: input.state,
          value: input.value,
        }),
        timeoutMs: 8000,
        policy: { allowHttp: false, blockPrivate: true },
      })
    } catch {
      /* best-effort */
    }
  }
}

export async function evaluateAlertById(alertId: string): Promise<{
  state: AlertState
  value: number | null
}> {
  const [alert] = await db
    .select()
    .from(observeAlerts)
    .where(eq(observeAlerts.id, alertId))
    .limit(1)
  if (!alert || !alert.enabled) {
    return { state: (alert?.state as AlertState) ?? "ok", value: null }
  }

  const [op] = await db
    .select()
    .from(observeProjects)
    .where(eq(observeProjects.id, alert.observeProjectId))
    .limit(1)
  if (!op) return { state: "ok", value: null }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, op.projectId))
    .limit(1)

  const query = queryForAlert(alert)
  let value: number | null = null
  try {
    const result = await runTelemetryQuery(
      observeClickHouseConfig(),
      op.projectId,
      query,
    )
    value = extractValue(result)
  } catch (err) {
    console.warn(
      "[alert-evaluator] query failed",
      alert.id,
      err instanceof Error ? err.message : err,
    )
    return { state: alert.state as AlertState, value: null }
  }

  if (value == null) return { state: alert.state as AlertState, value: null }

  const threshold = Number(alert.threshold)
  const breached = compare(value, alert.operator, threshold)
  const prev = (alert.state as AlertState) || "ok"
  let next: AlertState = prev

  if (breached) {
    if (prev === "ok" || prev === "recovering") next = "pending"
    else if (prev === "pending") next = "firing"
    else next = "firing"
  } else {
    if (prev === "firing" || prev === "pending") next = "recovering"
    else if (prev === "recovering") next = "ok"
    else next = "ok"
  }

  if (next !== prev) {
    await db
      .update(observeAlerts)
      .set({
        state: next,
        pendingSince: next === "pending" ? new Date() : alert.pendingSince,
        lastTriggeredAt:
          next === "firing" ? new Date() : alert.lastTriggeredAt,
        updatedAt: new Date(),
      })
      .where(eq(observeAlerts.id, alert.id))

    await recordTransition({
      alertId: alert.id,
      fromState: prev,
      toState: next,
      value,
      threshold: alert.threshold,
      message: `${value} ${alert.operator} ${alert.threshold}`,
    })

    if (next === "firing" || next === "ok") {
      let channelIds: string[] = []
      try {
        const parsed = JSON.parse(alert.channelIdsJson) as unknown
        if (Array.isArray(parsed)) {
          channelIds = parsed.filter((x): x is string => typeof x === "string")
        }
      } catch {
        /* ignore */
      }
      await deliverAlertNotification({
        alertName: alert.name,
        projectName: project?.name ?? op.projectId,
        state: next,
        value,
        threshold: alert.threshold,
        operator: alert.operator,
        channelIds,
        channelEmail: alert.channelEmail,
        channelWebhook: alert.channelWebhook,
      })
    }
  }

  return { state: next, value }
}

export async function evaluateAllAlerts(): Promise<number> {
  const rows = await db
    .select({ id: observeAlerts.id })
    .from(observeAlerts)
    .where(eq(observeAlerts.enabled, true))
  let n = 0
  for (const row of rows) {
    try {
      await evaluateAlertById(row.id)
      n++
    } catch (err) {
      console.warn("[alert-evaluator] rule failed", row.id, err)
    }
  }
  return n
}

const EVALUATOR_KEY = "__hostrigAlertEvaluator"

/** Start a single in-process evaluator loop (idempotent). */
export function startAlertEvaluator(intervalMs = 60_000): void {
  const g = globalThis as typeof globalThis & {
    [EVALUATOR_KEY]?: ReturnType<typeof setInterval>
  }
  if (g[EVALUATOR_KEY]) return
  g[EVALUATOR_KEY] = setInterval(() => {
    void evaluateAllAlerts().catch((err) => {
      console.warn("[alert-evaluator] tick failed", err)
    })
  }, intervalMs)
  // Kick once shortly after boot
  setTimeout(() => {
    void evaluateAllAlerts().catch(() => {})
  }, 5_000)
}
