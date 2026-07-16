import { describe, expect, it } from "vitest"

import { pickObserveNavSearch } from "./nav-search"

describe("pickObserveNavSearch", () => {
  it("preserves investigation scope keys", () => {
    const picked = pickObserveNavSearch({
      t: "7d",
      env: "production",
      svc: "api",
      f: "http.status:eq:500",
      q: "timeout",
    })
    expect(picked).toEqual({
      t: "7d",
      env: "production",
      svc: "api",
      f: "http.status:eq:500",
      q: "timeout",
    })
  })

  it("strips page-local keys", () => {
    const picked = pickObserveNavSearch({
      t: "24h",
      event: "evt_1",
      span: "span_1",
      log: "log_1",
      status: "unresolved",
      inspect: "1",
      tq: '{"metric":"rate"}',
    })
    expect(picked).toEqual({ t: "24h" })
  })

  it("returns empty object for empty/null input", () => {
    expect(pickObserveNavSearch(null)).toEqual({})
    expect(pickObserveNavSearch(undefined)).toEqual({})
    expect(pickObserveNavSearch({})).toEqual({})
  })
})
