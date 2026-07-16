export type EnvelopeHeader = {
  event_id?: string
  dsn?: string
  sent_at?: string
  sdk?: { name?: string; version?: string }
  [key: string]: unknown
}

export type EnvelopeItemHeader = {
  type: string
  length?: number
  content_type?: string
  [key: string]: unknown
}

export type ParsedEnvelopeItem = {
  header: EnvelopeItemHeader
  payload: unknown
  raw: string
}

export type ParsedEnvelope = {
  header: EnvelopeHeader
  items: ParsedEnvelopeItem[]
}

export class EnvelopeParseError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 = 400,
  ) {
    super(message)
    this.name = "EnvelopeParseError"
  }
}

export const MAX_EVENT_SIZE = 1_048_576
export const MAX_ENVELOPE_SIZE = 20 * 1024 * 1024

export async function gunzipIfNeeded(
  body: Buffer,
  contentEncoding: string | null,
): Promise<Buffer> {
  const enc = (contentEncoding ?? "").toLowerCase()
  if (enc.includes("gzip")) {
    const { gunzipSync } = await import("node:zlib")
    return gunzipSync(body)
  }
  return body
}

/**
 * Parse a Sentry envelope (NDJSON header + item header/payload pairs).
 */
export function parseEnvelope(raw: string | Buffer): ParsedEnvelope {
  const text = typeof raw === "string" ? raw : raw.toString("utf8")
  if (Buffer.byteLength(text, "utf8") > MAX_ENVELOPE_SIZE) {
    throw new EnvelopeParseError("Envelope too large", 413)
  }

  let offset = 0
  const nextLine = (): string | null => {
    if (offset >= text.length) return null
    const nl = text.indexOf("\n", offset)
    if (nl === -1) {
      const line = text.slice(offset)
      offset = text.length
      return line
    }
    const line = text.slice(offset, nl)
    offset = nl + 1
    return line
  }

  const headerLine = nextLine()
  if (headerLine === null || headerLine === "") {
    throw new EnvelopeParseError("Empty envelope")
  }

  let header: EnvelopeHeader
  try {
    header = JSON.parse(headerLine) as EnvelopeHeader
  } catch {
    throw new EnvelopeParseError("Invalid envelope header JSON")
  }

  const items: ParsedEnvelopeItem[] = []
  while (offset < text.length) {
    const itemHeaderLine = nextLine()
    if (itemHeaderLine === null) break
    if (itemHeaderLine === "") continue

    let itemHeader: EnvelopeItemHeader
    try {
      itemHeader = JSON.parse(itemHeaderLine) as EnvelopeItemHeader
    } catch {
      throw new EnvelopeParseError("Invalid item header JSON")
    }
    if (!itemHeader.type) {
      throw new EnvelopeParseError("Item header missing type")
    }

    let payloadRaw: string
    if (typeof itemHeader.length === "number" && itemHeader.length >= 0) {
      payloadRaw = text.slice(offset, offset + itemHeader.length)
      offset += itemHeader.length
      if (text[offset] === "\n") offset++
    } else {
      const line = nextLine()
      if (line === null) {
        throw new EnvelopeParseError("Missing item payload")
      }
      payloadRaw = line
    }

    if (Buffer.byteLength(payloadRaw, "utf8") > MAX_EVENT_SIZE) {
      throw new EnvelopeParseError("Event payload too large", 413)
    }

    let payload: unknown = payloadRaw
    const wantsJson =
      itemHeader.type === "event" ||
      itemHeader.type === "transaction" ||
      (itemHeader.content_type ?? "").includes("json")
    if (wantsJson) {
      try {
        payload = JSON.parse(payloadRaw)
      } catch {
        if (itemHeader.type === "event") {
          throw new EnvelopeParseError("Invalid event JSON")
        }
      }
    }

    items.push({ header: itemHeader, payload, raw: payloadRaw })
  }

  return { header, items }
}

/** Wrap a legacy /store JSON event as an envelope. */
export function eventToEnvelope(
  event: Record<string, unknown>,
  dsn?: string,
): string {
  const eventId =
    typeof event.event_id === "string" && event.event_id
      ? event.event_id
      : globalThis.crypto.randomUUID().replace(/-/g, "")
  const header = JSON.stringify({
    event_id: eventId,
    ...(dsn ? { dsn } : {}),
  })
  const payload = JSON.stringify({ ...event, event_id: eventId })
  const itemHeader = JSON.stringify({
    type: "event",
    content_type: "application/json",
    length: Buffer.byteLength(payload, "utf8"),
  })
  return `${header}\n${itemHeader}\n${payload}\n`
}
