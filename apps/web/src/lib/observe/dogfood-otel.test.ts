import { describe, expect, it } from "vitest"

import {
  isIngestNoiseSpan,
  parseOtelAuthHeaders,
  shouldIgnoreIncomingUrl,
  shouldIgnoreOutgoingUrl,
} from "./dogfood-otel"

describe("parseOtelAuthHeaders", () => {
  it("parses x-sentry-auth header string", () => {
    expect(
      parseOtelAuthHeaders(
        "x-sentry-auth=sentry sentry_key=abc123",
      ),
    ).toEqual({
      "x-sentry-auth": "sentry sentry_key=abc123",
    })
  })

  it("returns empty object for invalid input", () => {
    expect(parseOtelAuthHeaders("")).toEqual({})
    expect(parseOtelAuthHeaders("noequals")).toEqual({})
  })
})

describe("shouldIgnoreIncomingUrl", () => {
  it("ignores observe ingest and dogfood meta", () => {
    expect(shouldIgnoreIncomingUrl("http://local/api/7/envelope")).toBe(true)
    expect(shouldIgnoreIncomingUrl("http://local/api/7/otlp/v1/traces")).toBe(
      true,
    )
    expect(shouldIgnoreIncomingUrl("http://local/api/internal/dogfood")).toBe(
      true,
    )
  })

  it("allows normal app routes", () => {
    expect(shouldIgnoreIncomingUrl("http://local/observe")).toBe(false)
    expect(shouldIgnoreIncomingUrl("http://local/api/rpc/foo")).toBe(false)
  })
})

describe("shouldIgnoreOutgoingUrl", () => {
  it("ignores OTLP and envelope destinations", () => {
    expect(
      shouldIgnoreOutgoingUrl("http://127.0.0.1:3010/api/7/otlp/v1/traces"),
    ).toBe(true)
    expect(
      shouldIgnoreOutgoingUrl("http://127.0.0.1:3010/api/7/envelope/?sentry_key=x"),
    ).toBe(true)
  })

  it("allows other outbound URLs", () => {
    expect(shouldIgnoreOutgoingUrl("http://127.0.0.1:8123/?query=1")).toBe(
      false,
    )
  })
})

describe("isIngestNoiseSpan", () => {
  it("filters ingest span names and attributes", () => {
    expect(
      isIngestNoiseSpan({ name: "POST /api/7/otlp/v1/traces" }),
    ).toBe(true)
    expect(
      isIngestNoiseSpan({
        name: "POST",
        attributes: { "http.target": "/api/7/envelope" },
      }),
    ).toBe(true)
    expect(isIngestNoiseSpan({ name: "GET /login" })).toBe(false)
  })
})
