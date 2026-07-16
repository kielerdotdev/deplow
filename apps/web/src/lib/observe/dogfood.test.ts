import { describe, expect, it } from "vitest"

import { isDogfoodMetaPath, isObserveIngestUrl } from "./dogfood"

describe("isObserveIngestUrl", () => {
  it("matches sentry ingest paths", () => {
    expect(isObserveIngestUrl("http://localhost:3000/api/1/envelope/")).toBe(
      true,
    )
    expect(isObserveIngestUrl("/api/12/store")).toBe(true)
    expect(isObserveIngestUrl("http://x/api/3/otlp/v1/traces")).toBe(true)
  })

  it("ignores normal app routes", () => {
    expect(isObserveIngestUrl("http://localhost:3000/settings")).toBe(false)
    expect(isObserveIngestUrl("/api/rpc/observe.status")).toBe(false)
  })
})

describe("isDogfoodMetaPath", () => {
  it("matches dogfood bootstrap endpoint", () => {
    expect(isDogfoodMetaPath("/api/internal/dogfood")).toBe(true)
    expect(isDogfoodMetaPath("/api/internal/other")).toBe(false)
  })
})
