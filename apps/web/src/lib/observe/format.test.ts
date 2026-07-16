import { describe, expect, it } from "vitest"

import {
  formatAxisTick,
  formatPercent,
  formatRate,
  formatRelative,
  formatTimestampMs,
} from "./format"

describe("formatRate", () => {
  it("avoids lying about sparse nonzero traffic", () => {
    expect(formatRate(0)).toBe("0/s")
    expect(formatRate(0, { total: 6074 })).toBe("<0.01/s")
    expect(formatRate(0.0023)).toMatch(/\/h|<0\.01\/s/)
    expect(formatRate(1.234)).toBe("1.23/s")
  })
})

describe("formatPercent", () => {
  it("handles tiny rates", () => {
    expect(formatPercent(0)).toBe("0%")
    expect(formatPercent(0.001)).toBe("<0.01%")
  })
})

describe("timestamps", () => {
  it("formats ms precision", () => {
    const s = formatTimestampMs("2026-07-16T06:05:21.405Z")
    expect(s).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/)
  })

  it("formats relative", () => {
    expect(formatRelative(Date.now() - 90_000)).toBe("1m ago")
  })
})

describe("formatAxisTick", () => {
  it("produces readable ticks", () => {
    expect(formatAxisTick(0)).toBe("0")
    expect(formatAxisTick(0.1)).toBe("0.1")
    expect(formatAxisTick(1500, "ms")).toBe("1.5s")
  })
})
