export type MissingKind =
  | "no_frames"
  | "no_culprit"
  | "no_trace"
  | "no_release"
  | "unknown_release"
  | "zero_rate_with_traffic"
  | "single_span_traces"
  | "no_breadcrumbs"
  | "uncorrelated_log"

export type MissingCopy = {
  title: string
  detail: string
  actionLabel?: string
  actionHref?: string
}

const COPY: Record<MissingKind, MissingCopy> = {
  no_frames: {
    title: "No stack frames were captured",
    detail:
      "This event was recorded without a stack trace. Common causes: handled exceptions captured without frames, missing source maps/symbols, or SDK misconfiguration.",
    actionLabel: "View setup guidance",
    actionHref: "/observe",
  },
  no_culprit: {
    title: "No culprit",
    detail:
      "The SDK did not report a culprit (transaction or failing function). Check that the error is attached to a span or transaction.",
  },
  no_trace: {
    title: "No trace context",
    detail:
      "This event has no trace ID. It may be unsampled, captured outside a trace, or missing propagation headers.",
    actionLabel: "Learn about correlation",
  },
  no_release: {
    title: "Release attribution is missing",
    detail:
      "Spans are missing service.version. Set the resource attribute or send deployment notifications to unlock release comparisons.",
  },
  unknown_release: {
    title: "Unknown release",
    detail:
      "Telemetry arrived without a usable version. Treat this as an instrumentation gap, not a real release.",
  },
  zero_rate_with_traffic: {
    title: "Rate rounds below display precision",
    detail:
      "Request rate is below 0.01/s for the selected window, but spans exist. Use the period total or a shorter window.",
  },
  single_span_traces: {
    title: "Traces contain only one span",
    detail:
      "Configure distributed tracing and context propagation to see downstream work across services.",
  },
  no_breadcrumbs: {
    title: "No breadcrumbs",
    detail: "No breadcrumbs were attached to this event.",
  },
  uncorrelated_log: {
    title: "No trace context on this log",
    detail:
      "Trace propagation was not present when this log was emitted, so it cannot open a waterfall.",
  },
}

export function missingCopy(kind: MissingKind): MissingCopy {
  return COPY[kind]
}

export function missingTitle(kind: MissingKind): string {
  return COPY[kind].title
}
