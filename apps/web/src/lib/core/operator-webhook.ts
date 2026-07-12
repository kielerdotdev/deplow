/**
 * Thin outbound operator webhook for deploy/provision terminal events.
 * Never throws into the operation path.
 */

import { createHmac } from "node:crypto"

import { eq, db, operations } from "@deplow/db"

import {
  getOperatorWebhookSecretPlain,
  loadOperatorWebhookSettings,
} from "@/lib/operator-webhook-settings"

const NOTIFY_TIMEOUT_MS = 5_000
const NOTIFY_TYPES = new Set(["deploy", "provision"])

export type OperatorWebhookEvent = "operation.succeeded" | "operation.failed"

export function signOperatorWebhookBody(body: string, secret: string): string {
  return (
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex")
  )
}

export async function notifyOperatorWebhook(operationId: string): Promise<void> {
  try {
    const settings = await loadOperatorWebhookSettings()
    if (!settings.enabled || !settings.url) return

    const [op] = await db
      .select()
      .from(operations)
      .where(eq(operations.id, operationId))
    if (!op) return
    if (!NOTIFY_TYPES.has(op.type)) return

    if (op.status === "failed" && !settings.onFailure) return
    if (op.status === "succeeded" && !settings.onSuccess) return
    if (op.status !== "failed" && op.status !== "succeeded") return

    const event: OperatorWebhookEvent =
      op.status === "failed" ? "operation.failed" : "operation.succeeded"

    const payload = {
      event,
      operationId: op.id,
      type: op.type,
      status: op.status,
      projectId: op.projectId,
      serviceId: op.serviceId,
      errorMessage: op.errorMessage,
      errorCode: op.errorCode,
      finishedAt: op.finishedAt?.toISOString() ?? null,
    }
    const body = JSON.stringify(payload)
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "deplow-operator-webhook/1",
    }
    const secret = await getOperatorWebhookSecretPlain()
    if (secret) {
      headers["X-Deplow-Signature"] = signOperatorWebhookBody(body, secret)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), NOTIFY_TIMEOUT_MS)
    try {
      const res = await fetch(settings.url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      })
      if (!res.ok) {
        console.error(
          `[deplow] operator webhook HTTP ${res.status} for operation ${operationId}`,
        )
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (error) {
    console.error(
      `[deplow] operator webhook failed for operation ${operationId}`,
      error,
    )
  }
}
