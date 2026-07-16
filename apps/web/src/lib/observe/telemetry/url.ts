import {
  defaultTelemetryQuery,
  telemetryQuerySchema,
  type TelemetryQuery,
} from "./types"

const TQ_KEY = "tq"

/** Encode TelemetryQuery into a compact URL search param object. */
export function serializeTelemetryQuery(
  query: TelemetryQuery,
): Record<string, string> {
  return { [TQ_KEY]: encodeURIComponent(JSON.stringify(query)) }
}

/** Parse TelemetryQuery from URL search params (supports `tq` JSON). */
export function parseTelemetryQuery(
  search: Record<string, unknown>,
  fallbackSignal: TelemetryQuery["signal"] = "traces",
): TelemetryQuery {
  const raw = search[TQ_KEY]
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const decoded = decodeURIComponent(raw)
      const parsed = telemetryQuerySchema.safeParse(JSON.parse(decoded))
      if (parsed.success) return parsed.data
    } catch {
      /* fall through */
    }
    try {
      const parsed = telemetryQuerySchema.safeParse(JSON.parse(raw))
      if (parsed.success) return parsed.data
    } catch {
      /* fall through */
    }
  }
  return defaultTelemetryQuery(fallbackSignal)
}

export function telemetryQueryToSearchString(query: TelemetryQuery): string {
  const params = serializeTelemetryQuery(query)
  return new URLSearchParams(params).toString()
}
