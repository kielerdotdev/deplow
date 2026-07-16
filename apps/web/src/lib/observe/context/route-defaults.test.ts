import { describe, expect, it } from "vitest"

import {
  applyColdDefaults,
  rangeExceedsLogsRetention,
  searchHasTime,
} from "./route-defaults"

describe("route cold defaults", () => {
  it("detects time keys", () => {
    expect(searchHasTime({})).toBe(false)
    expect(searchHasTime({ t: "7d" })).toBe(true)
    expect(searchHasTime({ from: "a", to: "b" })).toBe(true)
  })

  it("applies per-route cold presets only when empty", () => {
    expect(applyColdDefaults("logs", {})).toEqual({ t: "15m" })
    expect(applyColdDefaults("overview", {})).toEqual({ t: "24h" })
    expect(applyColdDefaults("issues", {})).toEqual({ t: "24h" })
    expect(applyColdDefaults("traces", {})).toEqual({ t: "1h" })
    expect(applyColdDefaults("releases", {})).toEqual({ t: "14d" })
    expect(applyColdDefaults("logs", { t: "7d", env: "dev" })).toEqual({
      t: "7d",
      env: "dev",
    })
  })

  it("flags log ranges wider than retention", () => {
    const day = 24 * 60 * 60_000
    expect(rangeExceedsLogsRetention(0, 14 * day)).toBe(false)
    expect(rangeExceedsLogsRetention(0, 14 * day + 1)).toBe(true)
  })
})
