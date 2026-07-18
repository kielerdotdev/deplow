import { describe, expect, it } from "vitest"

import {
  buildDogfoodOtelEndpoint,
  dogfoodSelfBaseUrl,
  isDogfoodMetaPath,
  isObserveIngestUrl,
} from "./dogfood"

describe("isObserveIngestUrl", () => {
  it("matches sentry ingest paths", () => {
    expect(isObserveIngestUrl("http://localhost:9565/api/1/envelope/")).toBe(
      true,
    )
    expect(isObserveIngestUrl("/api/12/store")).toBe(true)
    expect(isObserveIngestUrl("http://x/api/3/otlp/v1/traces")).toBe(true)
  })

  it("ignores normal app routes", () => {
    expect(isObserveIngestUrl("http://localhost:9565/settings")).toBe(false)
    expect(isObserveIngestUrl("/api/rpc/observe.status")).toBe(false)
  })
})

describe("isDogfoodMetaPath", () => {
  it("matches dogfood bootstrap endpoint", () => {
    expect(isDogfoodMetaPath("/api/internal/dogfood")).toBe(true)
    expect(isDogfoodMetaPath("/api/internal/other")).toBe(false)
  })
})

describe("dogfood self ingest", () => {
  it("uses loopback vite port, not LAN ingest URL", () => {
    const prev = process.env.PORT
    delete process.env.PORT
    delete process.env.DEPLOW_DEV_PORT
    expect(dogfoodSelfBaseUrl()).toBe("http://127.0.0.1:9565")
    expect(buildDogfoodOtelEndpoint(7)).toBe(
      "http://127.0.0.1:9565/api/7/otlp",
    )
    process.env.PORT = "3010"
    expect(buildDogfoodOtelEndpoint(7)).toBe(
      "http://127.0.0.1:3010/api/7/otlp",
    )
    if (prev === undefined) delete process.env.PORT
    else process.env.PORT = prev
  })
})
