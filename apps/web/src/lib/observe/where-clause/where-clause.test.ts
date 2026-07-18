import { describe, expect, it } from "vitest"

import {
  applyWhereClauseToContext,
  contextToWhereClause,
  normalizeKey,
  parseWhereClause,
} from "./index"

describe("where-clause", () => {
  it("normalizes aliases", () => {
    expect(normalizeKey("service")).toBe("service.name")
    expect(normalizeKey("env")).toBe("deployment.environment")
    expect(normalizeKey("errors_only")).toBe("has_error")
  })

  it("parses AND clauses with quoted values", () => {
    const { clauses, warnings } = parseWhereClause(
      'service = "checkout" AND attr.http.route != "/health"',
    )
    expect(warnings).toHaveLength(0)
    expect(clauses).toEqual([
      { key: "service.name", operator: "=", value: "checkout" },
      { key: "attr.http.route", operator: "!=", value: "/health" },
    ])
  })

  it("supports contains and exists", () => {
    const { clauses } = parseWhereClause(
      'body contains "timeout" AND attr.user.id exists',
    )
    expect(clauses).toEqual([
      { key: "body", operator: "contains", value: "timeout" },
      { key: "attr.user.id", operator: "exists", value: "" },
    ])
  })

  it("round-trips filters via apply + serialize", () => {
    const applied = applyWhereClauseToContext(
      'service = "api" AND env = "prod" AND status = "error"',
      { filters: [], query: {} },
    )
    expect(applied.query.service).toBe("api")
    expect(applied.query.environment).toBe("prod")
    expect(applied.filters.some((f) => f.key === "attr.status")).toBe(true)

    const text = contextToWhereClause(applied.filters, applied.query)
    expect(text).toContain('service = "api"')
    expect(text).toContain('env = "prod"')
  })

  it("collects warnings for bad clauses", () => {
    const { clauses, warnings } = parseWhereClause("??? AND service = x")
    expect(clauses.length).toBeGreaterThanOrEqual(1)
    expect(warnings.length).toBeGreaterThanOrEqual(1)
  })
})
