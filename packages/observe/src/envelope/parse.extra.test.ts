import { gzipSync } from "node:zlib"
import { describe, expect, it } from "vitest"

import {
  EnvelopeParseError,
  eventToEnvelope,
  gunzipIfNeeded,
  parseEnvelope,
} from "./parse"

describe("parseEnvelope", () => {
  it("parses length-delimited event payload", () => {
    const payload = JSON.stringify({
      event_id: "11111111111111111111111111111111",
      message: "hi",
    })
    const body = [
      JSON.stringify({ event_id: "11111111111111111111111111111111" }),
      JSON.stringify({
        type: "event",
        length: Buffer.byteLength(payload, "utf8"),
      }),
      payload,
    ].join("\n")
    const parsed = parseEnvelope(body)
    expect(parsed.items).toHaveLength(1)
    expect((parsed.items[0]!.payload as { message: string }).message).toBe("hi")
  })

  it("rejects empty envelope", () => {
    expect(() => parseEnvelope("")).toThrow(EnvelopeParseError)
  })

  it("rejects invalid header json", () => {
    expect(() => parseEnvelope("not-json\n")).toThrow(/Invalid envelope header/)
  })

  it("rejects oversized event payload", () => {
    const big = "x".repeat(1_100_000)
    const payload = JSON.stringify({ message: big })
    const body = [
      "{}",
      JSON.stringify({
        type: "event",
        length: Buffer.byteLength(payload, "utf8"),
      }),
      payload,
    ].join("\n")
    expect(() => parseEnvelope(body)).toThrow(/too large/)
  })

  it("eventToEnvelope is parseable", () => {
    const raw = eventToEnvelope({
      message: "m",
      level: "error",
    })
    const parsed = parseEnvelope(raw)
    expect(parsed.items[0]!.header.type).toBe("event")
  })
})

describe("gunzipIfNeeded", () => {
  it("inflates gzip bodies", async () => {
    const plain = Buffer.from("hello-envelope")
    const gz = gzipSync(plain)
    const out = await gunzipIfNeeded(gz, "gzip")
    expect(out.toString("utf8")).toBe("hello-envelope")
  })

  it("passes through uncompressed", async () => {
    const plain = Buffer.from("plain")
    const out = await gunzipIfNeeded(plain, null)
    expect(out.equals(plain)).toBe(true)
  })
})
