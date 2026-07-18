import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

const mocks = vi.hoisted(() => ({
  findObserveProjectBySentryId: vi.fn(),
  findActiveKey: vi.fn(),
  stageEnvelopePayload: vi.fn(),
  checkObserveQuota: vi.fn(),
  enqueueObserveDigest: vi.fn(),
}))

vi.mock("@/lib/env", () => ({
  env: {
    observeEnabled: true,
    observeStagingDir: "/tmp/hostrig-observe-test",
  },
}))

vi.mock("@/lib/observe/store", () => ({
  findObserveProjectBySentryId: mocks.findObserveProjectBySentryId,
  findActiveKey: mocks.findActiveKey,
  stageEnvelopePayload: mocks.stageEnvelopePayload,
}))

vi.mock("@/lib/observe/quotas", () => ({
  checkObserveQuota: mocks.checkObserveQuota,
}))

vi.mock("@/lib/core/queue", () => ({
  enqueueObserveDigest: mocks.enqueueObserveDigest,
}))

import { eventToEnvelope } from "@hostrig/observe"

import {
  handleEnvelopeRequest,
  handleStoreRequest,
} from "./ingest-http"

describe("handleEnvelopeRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findObserveProjectBySentryId.mockResolvedValue({
      id: "op1",
      enabled: true,
      quotaPer5m: 1000,
      quotaPerHour: 5000,
      quotaPerMonth: 1_000_000,
    })
    mocks.findActiveKey.mockResolvedValue({ id: "k1", publicKey: "aa".repeat(16) })
    mocks.checkObserveQuota.mockResolvedValue({ ok: true })
    mocks.stageEnvelopePayload.mockResolvedValue({
      stagingPath: "/tmp/x.json",
      ingestionId: "ing1",
    })
    mocks.enqueueObserveDigest.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns 403 for bad sentry id", async () => {
    const res = await handleEnvelopeRequest(
      new Request("http://localhost/api/nope/envelope", { method: "POST", body: "{}" }),
      "nope",
    )
    expect(res.status).toBe(403)
  })

  it("returns 403 when key mismatches", async () => {
    mocks.findActiveKey.mockResolvedValue(null)
    const body = eventToEnvelope({ message: "x", event_id: "a".repeat(32) })
    const res = await handleEnvelopeRequest(
      new Request("http://localhost/api/1/envelope?sentry_key=deadbeef", {
        method: "POST",
        body,
      }),
      "1",
    )
    expect(res.status).toBe(403)
  })

  it("returns 429 when over quota", async () => {
    mocks.checkObserveQuota.mockResolvedValue({ ok: false, retryAfterSec: 30 })
    const key = "aa".repeat(16)
    const body = eventToEnvelope({ message: "x", event_id: "b".repeat(32) })
    const res = await handleEnvelopeRequest(
      new Request("http://localhost/api/1/envelope", {
        method: "POST",
        headers: {
          "X-Sentry-Auth": `Sentry sentry_key=${key}`,
        },
        body,
      }),
      "1",
    )
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("30")
  })

  it("stages event and enqueues digest", async () => {
    const key = "aa".repeat(16)
    const eventId = "c".repeat(32)
    const body = eventToEnvelope({
      message: "boom",
      event_id: eventId,
      exception: { values: [{ type: "Error", value: "boom" }] },
    })
    const res = await handleEnvelopeRequest(
      new Request("http://localhost/api/1/envelope", {
        method: "POST",
        headers: { "X-Sentry-Auth": `Sentry sentry_key=${key}` },
        body,
      }),
      "1",
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as { id: string }
    expect(json.id).toBe(eventId)
    expect(mocks.stageEnvelopePayload).toHaveBeenCalled()
    expect(mocks.enqueueObserveDigest).toHaveBeenCalledWith(
      expect.objectContaining({ sentryId: 1, eventId }),
    )
  })

  it("acks envelopes with only dropped items", async () => {
    const key = "aa".repeat(16)
    const body = [
      JSON.stringify({ event_id: "d".repeat(32) }),
      JSON.stringify({ type: "session" }),
      JSON.stringify({ status: "ok" }),
    ].join("\n")
    const res = await handleEnvelopeRequest(
      new Request("http://localhost/api/1/envelope", {
        method: "POST",
        headers: { "X-Sentry-Auth": `Sentry sentry_key=${key}` },
        body,
      }),
      "1",
    )
    expect(res.status).toBe(200)
    expect(mocks.enqueueObserveDigest).not.toHaveBeenCalled()
  })

  it("store adapter wraps JSON event", async () => {
    const key = "aa".repeat(16)
    const res = await handleStoreRequest(
      new Request("http://localhost/api/1/store", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sentry-Auth": `Sentry sentry_key=${key}`,
        },
        body: JSON.stringify({
          message: "from-store",
          event_id: "e".repeat(32),
        }),
      }),
      "1",
    )
    expect(res.status).toBe(200)
    expect(mocks.enqueueObserveDigest).toHaveBeenCalled()
  })
})
