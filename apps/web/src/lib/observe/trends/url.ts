import { resolveTimeRange, type TimeRange } from "@/lib/observe/context"
import {
  defaultTrendsQuery,
  trendsQuerySchema,
  type TrendsQuery,
} from "./types"

/** Compact URL search params for Trends (alongside or instead of full Context). */
export function serializeTrendsQuery(q: TrendsQuery): Record<string, string> {
  const parsed = trendsQuerySchema.parse(q)
  return {
    tq: encodeURIComponent(JSON.stringify(parsed)),
  }
}

export function parseTrendsQuery(
  search: Record<string, unknown> | undefined,
): TrendsQuery {
  const raw = search?.tq
  if (typeof raw !== "string" || !raw) {
    return defaultTrendsQuery()
  }
  try {
    const json = JSON.parse(decodeURIComponent(raw))
    return trendsQuerySchema.parse(json)
  } catch {
    try {
      return trendsQuerySchema.parse(JSON.parse(raw))
    } catch {
      return defaultTrendsQuery()
    }
  }
}

export function trendsTimeBounds(time: TimeRange): { from: Date; to: Date } {
  return resolveTimeRange(time)
}
