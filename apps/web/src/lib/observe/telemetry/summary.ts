import type { TelemetryQuery } from "./types"

/** Human-readable one-liner for progressive disclosure. */
export function summarizeTelemetryQuery(query: TelemetryQuery): string {
  const parts: string[] = []

  if (query.signal === "logs") parts.push("Logs")
  else if (query.signal === "metrics") {
    parts.push(query.metric?.name ? `Metric ${query.metric.name}` : "Metrics")
  } else if (query.signal === "errors") parts.push("Error logs")
  else {
    const scope =
      query.scope === "all"
        ? "All spans"
        : query.scope === "entrypoint"
          ? "Entrypoint spans"
          : "Root traces"
    parts.push(scope)
  }

  if (query.environment?.length) {
    parts.push(`in ${query.environment.join(", ")}`)
  }

  const clauses = query.filter.clauses
  if (clauses.length) {
    const bits = clauses.slice(0, 3).map((c) => {
      if (c.op === "exists") return `${c.key} exists`
      if (c.op === "not_exists") return `${c.key} missing`
      return `${c.key} ${c.op} ${c.value ?? ""}`.trim()
    })
    parts.push(
      `where ${bits.join(" and ")}${clauses.length > 3 ? "…" : ""}`,
    )
  }

  if (
    query.presentation.view === "timeseries" ||
    query.presentation.view === "table"
  ) {
    const fn = query.aggregation?.function ?? "count"
    const field = query.aggregation?.field
    parts.push(`showing ${fn}${field ? `(${field})` : ""}`)
    if (query.groupBy?.length) parts.push(`by ${query.groupBy.join(", ")}`)
    if (query.presentation.view === "timeseries") {
      parts.push(`every ${query.aggregation?.interval ?? "auto"}`)
    }
  }

  return parts.join(", ")
}
