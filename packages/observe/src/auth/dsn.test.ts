import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

import { buildDsn, extractSentryKey, publicKeyFromDsn } from "./dsn"

describe("extractSentryKey", () => {
  it("prefers X-Sentry-Auth over query", () => {
    const auth = extractSentryKey({
      authHeader:
        "Sentry sentry_version=7, sentry_key=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      queryKey: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    })
    expect(auth).toEqual({
      publicKey: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      source: "header",
    })
  })

  it("falls back to query then dsn", () => {
    expect(
      extractSentryKey({
        authHeader: null,
        queryKey: "cccccccccccccccccccccccccccccccc",
      })?.source,
    ).toBe("query")
    expect(
      extractSentryKey({
        authHeader: null,
        queryKey: null,
        envelopeDsn: "https://dddddddddddddddddddddddddddddddd@host/1",
      }),
    ).toEqual({
      publicKey: "dddddddddddddddddddddddddddddddd",
      source: "dsn",
    })
  })

  it("returns null when missing", () => {
    expect(
      extractSentryKey({ authHeader: null, queryKey: null }),
    ).toBeNull()
  })
})

describe("publicKeyFromDsn / buildDsn", () => {
  it("round-trips host and id", () => {
    const dsn = buildDsn({
      publicKey: "abc123",
      host: "observe.example.com",
      sentryId: 42,
      protocol: "https",
    })
    expect(dsn).toBe("https://abc123@observe.example.com/42")
    expect(publicKeyFromDsn(dsn)).toBe("abc123")
  })

  it("rejects garbage dsn", () => {
    expect(publicKeyFromDsn("not-a-url")).toBeNull()
  })
})

describe("hash stability", () => {
  it("sha256 length", () => {
    expect(createHash("sha256").update("x").digest("hex")).toHaveLength(64)
  })
})
