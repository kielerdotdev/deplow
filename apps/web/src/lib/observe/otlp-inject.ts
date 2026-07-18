/**
 * Inject hostrig.project_id into OTLP/JSON resource attributes when missing.
 * Also writes legacy deplow.project_id so older ClickHouse MVs still bridge.
 * Protobuf bodies are left untouched (clients / otelcol transform handle those).
 */
const PROJECT_ID_ATTRS = ["hostrig.project_id", "deplow.project_id"] as const

export function injectProjectIdIntoOtlpJson(
  body: Buffer,
  contentType: string | null,
  projectId: string,
): Buffer {
  const ct = (contentType ?? "").toLowerCase()
  if (!ct.includes("json")) return body
  try {
    const parsed = JSON.parse(body.toString("utf8")) as Record<string, unknown>
    const roots =
      (parsed.resourceSpans as unknown[]) ??
      (parsed.resourceLogs as unknown[]) ??
      (parsed.resourceMetrics as unknown[]) ??
      null
    if (!Array.isArray(roots)) return body

    for (const root of roots) {
      if (!root || typeof root !== "object") continue
      const res = root as { resource?: { attributes?: unknown[] } }
      if (!res.resource) res.resource = { attributes: [] }
      if (!Array.isArray(res.resource.attributes)) res.resource.attributes = []
      const attrs = res.resource.attributes as Array<{
        key?: string
        value?: { stringValue?: string }
      }>
      for (const key of PROJECT_ID_ATTRS) {
        const existing = attrs.find((a) => a.key === key)
        if (existing) {
          existing.value = { stringValue: projectId }
        } else {
          attrs.push({
            key,
            value: { stringValue: projectId },
          })
        }
      }
    }
    return Buffer.from(JSON.stringify(parsed), "utf8")
  } catch {
    return body
  }
}
