import { describe, expect, it } from "vitest"

import { eventToEnvelope, parseEnvelope } from "./parse"
import { groupEvent, normalizeMessage } from "../grouping/v1"
import { extractSentryKey, buildDsn } from "../auth/dsn"

describe("parseEnvelope", () => {
  it("parses a minimal event envelope", () => {
    const body = eventToEnvelope({
      event_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      message: "boom",
      level: "error",
      exception: {
        values: [{ type: "Error", value: "boom" }],
      },
    })
    const parsed = parseEnvelope(body)
    expect(parsed.header.event_id).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]!.header.type).toBe("event")
    expect((parsed.items[0]!.payload as { message: string }).message).toBe(
      "boom",
    )
  })

  it("keeps non-event items but preserves type", () => {
    const body = [
      JSON.stringify({ event_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }),
      JSON.stringify({ type: "session" }),
      JSON.stringify({ status: "ok" }),
      JSON.stringify({
        type: "event",
        length: Buffer.byteLength('{"message":"x"}', "utf8"),
      }),
      '{"message":"x"}',
    ].join("\n")
    const parsed = parseEnvelope(body)
    expect(parsed.items.map((i) => i.header.type)).toEqual(["session", "event"])
  })
})

describe("grouping", () => {
  it("normalizes ids in messages", () => {
    expect(normalizeMessage("user 12345 failed uuid 550e8400-e29b-41d4-a716-446655440000")).toContain(
      "<num>",
    )
    expect(normalizeMessage("user 12345 failed uuid 550e8400-e29b-41d4-a716-446655440000")).toContain(
      "<uuid>",
    )
  })

  it("groups by exception type and value", () => {
    const a = groupEvent({
      exception: { values: [{ type: "TypeError", value: "x 9999" }] },
    })
    const b = groupEvent({
      exception: { values: [{ type: "TypeError", value: "x 4242" }] },
    })
    expect(a.groupingKeyHash).toBe(b.groupingKeyHash)
    expect(a.groupingKeyHash).toHaveLength(64)
  })
})

describe("auth", () => {
  it("extracts sentry_key from header", () => {
    const auth = extractSentryKey({
      authHeader:
        "Sentry sentry_version=7, sentry_key=abcdef0123456789abcdef0123456789, sentry_client=sentry.javascript.node/8.0.0",
      queryKey: null,
    })
    expect(auth?.publicKey).toBe("abcdef0123456789abcdef0123456789")
  })

  it("builds dsn", () => {
    expect(
      buildDsn({
        publicKey: "abc",
        host: "localhost:3000",
        sentryId: 1,
        protocol: "http",
      }),
    ).toBe("http://abc@localhost:3000/1")
  })
})
