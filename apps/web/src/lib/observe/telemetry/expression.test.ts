import { describe, expect, it } from "vitest"

import {
  parseFilterExpression,
  serializeFilterExpression,
} from "./expression"

describe("filter expression parser", () => {
  it("parses equality and comparisons", () => {
    const r = parseFilterExpression(
      "service = 'frontend' AND http.status_code >= 500",
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.group.clauses).toEqual([
      { key: "service", op: "eq", value: "frontend" },
      { key: "http.status_code", op: "gte", value: "500" },
    ])
  })

  it("parses EXISTS and CONTAINS", () => {
    const r = parseFilterExpression(
      "queue.retry_count EXISTS AND body CONTAINS 'timeout'",
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.group.clauses[0]).toEqual({
      key: "queue.retry_count",
      op: "exists",
    })
    expect(r.group.clauses[1]).toEqual({
      key: "body",
      op: "contains",
      value: "timeout",
    })
  })

  it("round-trips serialize", () => {
    const r = parseFilterExpression(
      "deployment.environment = 'production' AND status = 'error'",
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const text = serializeFilterExpression(r.group)
    expect(text).toContain("deployment.environment")
    expect(text).toContain("production")
    const again = parseFilterExpression(text)
    expect(again.ok).toBe(true)
  })

  it("rejects garbage", () => {
    const r = parseFilterExpression("!!!")
    expect(r.ok).toBe(false)
  })
})
