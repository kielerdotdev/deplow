import fs from "node:fs/promises"

import {
  EnvelopeParseError,
  eventToEnvelope,
  extractSentryKey,
  gunzipIfNeeded,
  parseEnvelope,
} from "@deplow/observe"

import { env } from "@/lib/env"
import { enqueueObserveDigest } from "@/lib/core/queue"
import { checkObserveQuota } from "@/lib/observe/quotas"
import {
  findActiveKey,
  findObserveProjectBySentryId,
  stageEnvelopePayload,
} from "@/lib/observe/store"

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "content-type, x-sentry-auth, sentry-trace, baggage",
  "Access-Control-Expose-Headers": "x-sentry-error, retry-after",
}

export function observeCorsOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function handleEnvelopeRequest(
  request: Request,
  sentryIdParam: string,
): Promise<Response> {
  if (!env.observeEnabled) {
    return json({ error: "Observe disabled" }, 404)
  }

  const sentryId = Number(sentryIdParam)
  if (!Number.isFinite(sentryId) || sentryId < 1) {
    return json({ error: "Forbidden" }, 403)
  }

  const observeProject = await findObserveProjectBySentryId(sentryId)
  if (!observeProject?.enabled) {
    return json({ error: "Forbidden" }, 403)
  }

  const rawBuf = Buffer.from(await request.arrayBuffer())
  let body: Buffer
  try {
    body = await gunzipIfNeeded(rawBuf, request.headers.get("content-encoding"))
  } catch {
    return json({ error: "Invalid gzip body" }, 400)
  }

  let parsed
  try {
    parsed = parseEnvelope(body)
  } catch (err) {
    if (err instanceof EnvelopeParseError) {
      return json({ error: err.message }, err.status)
    }
    return json({ error: "Invalid envelope" }, 400)
  }

  const auth = extractSentryKey({
    authHeader: request.headers.get("x-sentry-auth"),
    queryKey: new URL(request.url).searchParams.get("sentry_key"),
    envelopeDsn:
      typeof parsed.header.dsn === "string" ? parsed.header.dsn : undefined,
  })
  if (!auth) {
    return json({ error: "Forbidden" }, 403)
  }
  const key = await findActiveKey(observeProject.id, auth.publicKey)
  if (!key) {
    return json({ error: "Forbidden" }, 403)
  }

  const quota = await checkObserveQuota({
    sentryId,
    quotaPer5m: observeProject.quotaPer5m,
    quotaPerHour: observeProject.quotaPerHour,
    quotaPerMonth: observeProject.quotaPerMonth,
  })
  if (!quota.ok) {
    return new Response(null, {
      status: 429,
      headers: {
        ...CORS_HEADERS,
        "Retry-After": String(quota.retryAfterSec),
      },
    })
  }

  const eventItems = parsed.items.filter((i) => i.header.type === "event")
  if (eventItems.length === 0) {
    const id = parsed.header.event_id
    return id ? json({ id }, 200) : new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  // One event per envelope (BugSink-aligned)
  const item = eventItems[0]!
  const event = item.payload as Record<string, unknown>
  const eventId =
    (typeof parsed.header.event_id === "string" && parsed.header.event_id) ||
    (typeof event.event_id === "string" && event.event_id) ||
    crypto.randomUUID().replace(/-/g, "")
  event.event_id = eventId

  const staged = await stageEnvelopePayload(
    Buffer.from(JSON.stringify(event), "utf8"),
  )
  try {
    await enqueueObserveDigest({
      sentryId,
      eventId,
      stagingPath: staged.stagingPath,
      receivedAt: new Date().toISOString(),
    })
  } catch (err) {
    await fs.unlink(staged.stagingPath).catch(() => {})
    console.error("[observe] enqueue digest failed", err)
    return json({ error: "Ingest unavailable" }, 503)
  }

  return json({ id: eventId }, 200)
}

export async function handleStoreRequest(
  request: Request,
  sentryIdParam: string,
): Promise<Response> {
  if (!env.observeEnabled) {
    return json({ error: "Observe disabled" }, 404)
  }
  const rawBuf = Buffer.from(await request.arrayBuffer())
  let body: Buffer
  try {
    body = await gunzipIfNeeded(rawBuf, request.headers.get("content-encoding"))
  } catch {
    return json({ error: "Invalid gzip body" }, 400)
  }
  let event: Record<string, unknown>
  try {
    event = JSON.parse(body.toString("utf8")) as Record<string, unknown>
  } catch {
    return json({ error: "Invalid JSON" }, 400)
  }
  const envelope = eventToEnvelope(event)
  const fakeReq = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: envelope,
  })
  return handleEnvelopeRequest(fakeReq, sentryIdParam)
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  })
}
