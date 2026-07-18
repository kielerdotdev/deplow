import { describe, expect, it } from "vitest"

import {
  filterIssuesByContext,
  hasStructuredIssueFilters,
} from "./issues-filter-sidebar"
import type { ObserveContext } from "@/lib/observe/context"

function ctx(
  patch: Partial<ObserveContext> & {
    query?: ObserveContext["query"]
    filters?: ObserveContext["filters"]
    time?: ObserveContext["time"]
  } = {},
): ObserveContext {
  return {
    time: patch.time ?? { kind: "preset", preset: "30d" },
    baseline: { mode: "none" },
    filters: patch.filters ?? [],
    query: patch.query ?? {},
    ...patch,
  }
}

const now = Date.parse("2026-07-17T12:00:00.000Z")

const issues = [
  {
    title: "TypeError boom",
    culprit: "app.ts",
    level: "error",
    lastSeen: "2026-07-17T11:00:00.000Z",
  },
  {
    title: "Warn slow",
    culprit: "db.ts",
    level: "warning",
    lastSeen: "2026-07-17T11:30:00.000Z",
  },
  {
    title: "Fatal OOM",
    culprit: "mem.ts",
    level: "fatal",
    // Within a 30d window from `now` (2026-07-17), outside a 1h window
    lastSeen: "2026-07-10T00:00:00.000Z",
  },
]

describe("filterIssuesByContext", () => {
  it("returns all when no filters and wide time range", () => {
    expect(filterIssuesByContext(issues, ctx(), now)).toHaveLength(3)
  })

  it("applies text search", () => {
    const out = filterIssuesByContext(
      issues,
      ctx({ query: { q: "fatal" } }),
      now,
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.title).toContain("OOM")
  })

  it("applies errors only", () => {
    const out = filterIssuesByContext(
      issues,
      ctx({ query: { errorsOnly: true } }),
      now,
    )
    expect(out.map((i) => i.level).sort()).toEqual(["error", "fatal"])
  })

  it("applies level filters", () => {
    const out = filterIssuesByContext(
      issues,
      ctx({
        filters: [{ key: "level", op: "eq", value: "warning" }],
      }),
      now,
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.level).toBe("warning")
  })

  it("applies time range using lastSeen", () => {
    const out = filterIssuesByContext(
      issues,
      ctx({ time: { kind: "preset", preset: "1h" } }),
      now,
    )
    // Fatal OOM is from July 10 — outside last hour
    expect(out.map((i) => i.title).sort()).toEqual([
      "TypeError boom",
      "Warn slow",
    ])
  })

  it("can empty the list solely via restrictive time", () => {
    const out = filterIssuesByContext(
      issues,
      ctx({ time: { kind: "preset", preset: "1m" } }),
      now,
    )
    expect(out).toHaveLength(0)
  })
})

describe("hasStructuredIssueFilters", () => {
  it("ignores time-only context", () => {
    expect(
      hasStructuredIssueFilters(
        ctx({ time: { kind: "preset", preset: "1m" } }),
      ),
    ).toBe(false)
  })

  it("detects search and errors-only", () => {
    expect(hasStructuredIssueFilters(ctx({ query: { q: "x" } }))).toBe(true)
    expect(
      hasStructuredIssueFilters(ctx({ query: { errorsOnly: true } })),
    ).toBe(true)
  })
})
