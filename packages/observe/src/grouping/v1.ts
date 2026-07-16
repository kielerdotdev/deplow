import { createHash } from "node:crypto"

export type GroupingResult = {
  mechanism: "deplow-v1"
  groupingKey: string
  groupingKeyHash: string
  title: string
  culprit: string
  level: string
  message: string
  platform: string
  transaction: string
  environment: string
  release: string
  traceId: string
  fingerprint: string[]
}

type ExceptionValue = {
  type?: string
  value?: string
  stacktrace?: {
    frames?: Array<{
      filename?: string
      abs_path?: string
      function?: string
      lineno?: number
      in_app?: boolean
    }>
  }
}

/**
 * BugSink-inspired simple grouper: prefer custom fingerprint, else type+normalized value.
 * Does not include transaction in the key (avoids over-splitting).
 */
export function groupEvent(event: Record<string, unknown>): GroupingResult {
  const level = stringField(event.level) || "error"
  const platform = stringField(event.platform) || "unknown"
  const transaction = stringField(event.transaction) || ""
  const environment =
    stringField((event.tags as Record<string, string> | undefined)?.environment) ||
    stringField(event.environment) ||
    ""
  const release = stringField(event.release) || ""
  const contexts = (event.contexts ?? {}) as Record<string, unknown>
  const trace = (contexts.trace ?? {}) as Record<string, unknown>
  const traceId = stringField(trace.trace_id) || ""

  const { type, value, culprit } = extractException(event)
  const message =
    stringField(event.message) ||
    stringField((event.logentry as { formatted?: string } | undefined)?.formatted) ||
    value ||
    "Unknown error"

  const title = type ? `${type}: ${truncate(value || message, 200)}` : truncate(message, 200)

  let fingerprint: string[]
  const custom = event.fingerprint
  if (Array.isArray(custom) && custom.length > 0 && !isDefaultFingerprint(custom)) {
    fingerprint = custom.map(String)
    const expanded = fingerprint.flatMap((part) =>
      part === "{{ default }}"
        ? [defaultGroupingKey(type, value, message)]
        : [part],
    )
    const groupingKey = expanded.join(" \u22c4 ")
    return finish(groupingKey, fingerprint, title, culprit || transaction, {
      level,
      message,
      platform,
      transaction,
      environment,
      release,
      traceId,
    })
  }

  const groupingKey = defaultGroupingKey(type, value, message)
  fingerprint = ["{{ default }}"]
  return finish(groupingKey, fingerprint, title, culprit || transaction, {
    level,
    message,
    platform,
    transaction,
    environment,
    release,
    traceId,
  })
}

function finish(
  groupingKey: string,
  fingerprint: string[],
  title: string,
  culprit: string,
  meta: Omit<
    GroupingResult,
    "mechanism" | "groupingKey" | "groupingKeyHash" | "title" | "culprit" | "fingerprint"
  >,
): GroupingResult {
  return {
    mechanism: "deplow-v1",
    groupingKey,
    groupingKeyHash: sha256(`deplow-v1\0${groupingKey}`),
    title,
    culprit,
    fingerprint,
    ...meta,
  }
}

function defaultGroupingKey(
  type: string,
  value: string,
  message: string,
): string {
  if (type) {
    return `${type}: ${normalizeMessage(value || message)}`
  }
  return normalizeMessage(message)
}

function extractException(event: Record<string, unknown>): {
  type: string
  value: string
  culprit: string
} {
  const exception = event.exception as
    | { values?: ExceptionValue[] }
    | undefined
  const values = exception?.values
  if (!values?.length) {
    return {
      type: "",
      value: "",
      culprit: stringField(event.culprit) || "",
    }
  }
  const last = values[values.length - 1]!
  const frames = last.stacktrace?.frames ?? []
  const inApp = [...frames].reverse().find((f) => f.in_app)
  const top = inApp ?? frames[frames.length - 1]
  const culprit =
    stringField(event.culprit) ||
    (top
      ? `${top.filename || top.abs_path || "?"}:${top.function || "?"}`
      : "")
  return {
    type: last.type ?? "",
    value: last.value ?? "",
    culprit,
  }
}

/** Strip UUIDs, hex ids, and long digit runs for stable grouping. */
export function normalizeMessage(input: string): string {
  return input
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "<uuid>",
    )
    .replace(/\b[0-9a-f]{16,}\b/gi, "<hex>")
    // Match digit runs even when glued to units (e.g. 9999ms)
    .replace(/\d{4,}/g, "<num>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500)
}

function isDefaultFingerprint(parts: unknown[]): boolean {
  return parts.length === 1 && String(parts[0]) === "{{ default }}"
}

function stringField(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex")
}
