import { describe, expect, it } from "vitest"

import { esc, spanWhere } from "./common"

describe("observe query helpers", () => {
  it("escapes quotes in literals", () => {
    expect(esc("a'b")).toBe("a\\'b")
  })

  it("builds span where with service and duration", () => {
    const sql = spanWhere({
      projectId: "p1",
      from: new Date("2026-07-15T00:00:00Z"),
      to: new Date("2026-07-15T01:00:00Z"),
      service: "api",
      durationMsMin: 100,
      durationMsMax: 2000,
      attributeFilters: [{ key: "http.status_code", op: "eq", value: "500" }],
    })
    expect(sql).toContain("project_id = 'p1'")
    expect(sql).toContain("ServiceName = 'api'")
    expect(sql).toContain("Duration >=")
    expect(sql).toContain("http.status_code")
  })
})
