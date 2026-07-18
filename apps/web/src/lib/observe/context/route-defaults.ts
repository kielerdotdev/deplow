import type { TimePreset } from "./types"

export type ObserveListRoute =
  | "overview"
  | "issues"
  | "traces"
  | "logs"
  | "releases"
  | "services"
  | "trends"

/** Cold-landing presets when URL has no time keys. Continuity overrides when present. */
export const COLD_TIME_PRESET: Record<ObserveListRoute, TimePreset> = {
  overview: "24h",
  issues: "24h",
  traces: "1h",
  logs: "15m",
  releases: "14d",
  services: "24h",
  trends: "24h",
}

/** Soft retention hint for logs UI (days). */
export const LOGS_RETENTION_DAYS = 14

const TIME_KEYS = new Set(["t", "from", "to"])

export function searchHasTime(search: Record<string, unknown>): boolean {
  for (const key of TIME_KEYS) {
    const v = search[key]
    if (typeof v === "string" && v !== "") return true
  }
  return false
}

/**
 * When search has no time selection, inject the route cold default preset.
 * Does not overwrite an explicit investigation range.
 */
export function applyColdDefaults(
  route: ObserveListRoute,
  search: Record<string, unknown>,
): Record<string, unknown> {
  if (searchHasTime(search)) return search
  const preset = COLD_TIME_PRESET[route]
  return { ...search, t: preset }
}

export function rangeExceedsLogsRetention(
  fromMs: number,
  toMs: number,
  retentionDays = LOGS_RETENTION_DAYS,
): boolean {
  return toMs - fromMs > retentionDays * 24 * 60 * 60_000
}
