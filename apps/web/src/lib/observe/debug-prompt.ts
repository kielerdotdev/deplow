/** Build a pasteable debug prompt from span/issue context. */
export function buildDebugPrompt(input: {
  kind: "span" | "issue" | "trace"
  title: string
  projectId?: string
  traceId?: string
  spanId?: string
  service?: string
  status?: string
  durationMs?: number
  message?: string
  attributes?: Record<string, string>
  topFrame?: string
}): string {
  const lines = [
    `## ${input.kind === "issue" ? "Issue" : input.kind === "span" ? "Span" : "Trace"} debug context`,
    "",
    `Title: ${input.title}`,
  ]
  if (input.service) lines.push(`Service: ${input.service}`)
  if (input.status) lines.push(`Status: ${input.status}`)
  if (input.durationMs != null) {
    lines.push(`Duration: ${input.durationMs.toFixed(1)} ms`)
  }
  if (input.traceId) lines.push(`Trace ID: ${input.traceId}`)
  if (input.spanId) lines.push(`Span ID: ${input.spanId}`)
  if (input.projectId) lines.push(`Project: ${input.projectId}`)
  if (input.message) {
    lines.push("", "Message:", input.message)
  }
  if (input.topFrame) {
    lines.push("", "Top frame:", input.topFrame)
  }
  if (input.attributes && Object.keys(input.attributes).length > 0) {
    lines.push("", "Attributes:")
    for (const [k, v] of Object.entries(input.attributes).slice(0, 40)) {
      lines.push(`- ${k}: ${v}`)
    }
  }
  lines.push(
    "",
    "Please diagnose the failure, likely root cause, and next debugging steps.",
  )
  return lines.join("\n")
}
