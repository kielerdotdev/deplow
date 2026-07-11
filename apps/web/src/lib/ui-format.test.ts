import { describe, expect, it } from "vitest"

import { formatRelativeTime, summarizeDeployError } from "./ui-format"

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-07-11T12:00:00.000Z")

  it("formats seconds and minutes", () => {
    expect(
      formatRelativeTime("2026-07-11T11:59:45.000Z", now),
    ).toBe("15s ago")
    expect(
      formatRelativeTime("2026-07-11T11:50:00.000Z", now),
    ).toBe("10m ago")
  })

  it("falls back for empty input", () => {
    expect(formatRelativeTime(null)).toBe("—")
  })
})

describe("summarizeDeployError", () => {
  it("prefers ❌ lines", () => {
    expect(
      summarizeDeployError("noise\n❌ Railpack is not installed\nmore"),
    ).toBe("Railpack is not installed")
  })
})
