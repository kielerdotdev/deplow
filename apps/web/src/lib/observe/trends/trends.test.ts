import { describe, expect, it } from "vitest"

import { evalFormula, validateFormulaExpr } from "./formula"
import { migrateInsightToTrends, defaultTrendsQuery } from "./index"

describe("trends formula", () => {
  it("evaluates arithmetic", () => {
    expect(evalFormula("B/A*100", { A: 50, B: 25 })).toBe(50)
    expect(evalFormula("(A+B)/2", { A: 10, B: 20 })).toBe(15)
    expect(evalFormula("A/(B)", { A: 1, B: 0 })).toBeNull()
  })

  it("validates letter refs", () => {
    expect(validateFormulaExpr("A+B", ["A", "B"]).ok).toBe(true)
    expect(validateFormulaExpr("A+C", ["A", "B"]).ok).toBe(false)
  })
})

describe("migrateInsightToTrends", () => {
  it("maps rate insight", () => {
    const q = migrateInsightToTrends({
      version: 2,
      source: "spans",
      kind: "line",
      measure: { type: "rate" },
    })
    expect(q.version).toBe(1)
    expect(q.series).toHaveLength(1)
    expect(q.series[0]?.measure).toBe("rate")
  })

  it("passes through TrendsQuery", () => {
    const d = defaultTrendsQuery()
    expect(migrateInsightToTrends(d).series[0]?.letter).toBe("A")
  })
})
