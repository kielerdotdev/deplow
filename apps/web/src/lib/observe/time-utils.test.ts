import { describe, expect, it } from "vitest"

import { presetLabel, relativeToTimeRange, shorthandLabel } from "./time-utils"

describe("time-utils", () => {
  it("parses known presets", () => {
    expect(relativeToTimeRange("15m")).toEqual({
      kind: "preset",
      preset: "15m",
    })
    expect(relativeToTimeRange("1h")).toEqual({ kind: "preset", preset: "1h" })
  })

  it("parses arbitrary shorthand into absolute", () => {
    const range = relativeToTimeRange("3h")
    expect(range?.kind).toBe("absolute")
    if (range?.kind === "absolute") {
      const ms = Date.parse(range.to) - Date.parse(range.from)
      expect(ms).toBeGreaterThan(2.9 * 60 * 60_000)
      expect(ms).toBeLessThan(3.1 * 60 * 60_000)
    }
  })

  it("parses today", () => {
    const range = relativeToTimeRange("today")
    expect(range?.kind).toBe("absolute")
  })

  it("rejects garbage", () => {
    expect(relativeToTimeRange("nope")).toBeNull()
  })

  it("labels presets", () => {
    expect(presetLabel("1h")).toBe("Last 1h")
    expect(shorthandLabel("2d")).toBe("Last 2 days")
  })
})
