import type { EmptyVariant } from "./empty-state"

export type IssueStatusId = "unresolved" | "resolved" | "muted"

export type IssuesEmptyDecision = {
  variant: EmptyVariant
  title: string
  description: string
  /** Machine-readable primary CTA for the page to wire. */
  primaryAction?:
    | "setup"
    | "view_resolved"
    | "clear_filters"
    | "expand_time"
  secondaryAction?: "go_traces" | "expand_time"
}

/**
 * Pure empty-state selection for the Issues list.
 * Separates “never received / wrong status / filters / time range”.
 */
export function resolveIssuesEmptyState(input: {
  issueStatus: IssueStatusId
  statusCounts: {
    unresolved: number
    resolved: number
    muted: number
  }
  /** Count of issues returned for the active status (before client filters). */
  statusIssueCount: number
  /** Count after client-side search/level/errors/time filters. */
  filteredCount: number
  /** Text search, level chips, errors-only (not time). */
  hasStructuredFilters: boolean
}): IssuesEmptyDecision | null {
  if (input.filteredCount > 0) return null

  const otherBuckets =
    input.statusCounts.unresolved +
    input.statusCounts.resolved +
    input.statusCounts.muted

  // Nothing in this status from the API at all
  if (input.statusIssueCount === 0) {
    if (otherBuckets === 0) {
      return {
        variant: "empty",
        title: "No events have been received",
        description:
          "Grouped errors appear here once your app sends exception events to this project.",
        primaryAction: "setup",
        secondaryAction: "go_traces",
      }
    }
    if (input.issueStatus === "unresolved") {
      return {
        variant: "no_unresolved",
        title: "No unresolved issues",
        description:
          "No open grouped errors for this project. Check Resolved or Ignored, or wait for new events.",
        primaryAction: "view_resolved",
        secondaryAction: "go_traces",
      }
    }
    const label =
      input.issueStatus === "muted" ? "ignored" : input.issueStatus
    return {
      variant: "empty",
      title: `No ${label} issues`,
      description:
        "Nothing in this status yet. Switch tabs or wait for new events.",
    }
  }

  // Status has issues, but client filters exclude them
  if (input.hasStructuredFilters) {
    return {
      variant: "no_match",
      title: "No issues match the current filters",
      description:
        "No grouped errors match the selected search, levels, or Errors only filter.",
      primaryAction: "clear_filters",
      secondaryAction: "expand_time",
    }
  }

  // Remaining case: issues exist for the status but none fall in the time range
  return {
    variant: "outside_range",
    title: "No issues in this time range",
    description:
      "Try expanding the time range — issues may exist outside the selected period.",
    primaryAction: "expand_time",
  }
}
