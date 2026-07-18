import { describe, expect, it } from "vitest"

import { resolveIssuesEmptyState } from "./issues-empty-state"

const emptyCounts = { unresolved: 0, resolved: 0, muted: 0 }

describe("resolveIssuesEmptyState", () => {
  it("returns null when results exist", () => {
    expect(
      resolveIssuesEmptyState({
        issueStatus: "unresolved",
        statusCounts: { unresolved: 2, resolved: 0, muted: 0 },
        statusIssueCount: 2,
        filteredCount: 2,
        hasStructuredFilters: false,
      }),
    ).toBeNull()
  })

  it("detects never-received telemetry", () => {
    const d = resolveIssuesEmptyState({
      issueStatus: "unresolved",
      statusCounts: emptyCounts,
      statusIssueCount: 0,
      filteredCount: 0,
      hasStructuredFilters: false,
    })
    expect(d?.variant).toBe("empty")
    expect(d?.title).toMatch(/No events have been received/)
    expect(d?.primaryAction).toBe("setup")
  })

  it("detects no unresolved when other statuses exist", () => {
    const d = resolveIssuesEmptyState({
      issueStatus: "unresolved",
      statusCounts: { unresolved: 0, resolved: 4, muted: 1 },
      statusIssueCount: 0,
      filteredCount: 0,
      hasStructuredFilters: false,
    })
    expect(d?.variant).toBe("no_unresolved")
    expect(d?.primaryAction).toBe("view_resolved")
  })

  it("detects structured filter mismatch", () => {
    const d = resolveIssuesEmptyState({
      issueStatus: "unresolved",
      statusCounts: { unresolved: 3, resolved: 0, muted: 0 },
      statusIssueCount: 3,
      filteredCount: 0,
      hasStructuredFilters: true,
    })
    expect(d?.variant).toBe("no_match")
    expect(d?.primaryAction).toBe("clear_filters")
  })

  it("detects restrictive time range when status has issues but none match", () => {
    const d = resolveIssuesEmptyState({
      issueStatus: "unresolved",
      statusCounts: { unresolved: 5, resolved: 0, muted: 0 },
      statusIssueCount: 5,
      filteredCount: 0,
      hasStructuredFilters: false,
    })
    expect(d?.variant).toBe("outside_range")
    expect(d?.primaryAction).toBe("expand_time")
    expect(d?.title).toMatch(/time range/i)
  })
})
