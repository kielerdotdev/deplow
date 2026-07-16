import { describe, expect, it } from "vitest"

import { evalFormula, resolveIntervalSec } from "./trends-run"

describe("trends-run helpers", () => {
  it("resolves auto interval toward ~90 buckets", () => {
    const from = new Date("2024-01-01T00:00:00Z")
    const to = new Date("2024-01-01T01:00:00Z")
    const sec = resolveIntervalSec("auto", from, to)
    expect(sec).toBeGreaterThanOrEqual(10)
    expect(sec).toBeLessThanOrEqual(120)
  })

  it("evaluates formulas", () => {
    expect(evalFormula("A+B", { A: 1, B: 2 })).toBe(3)
  })
})
