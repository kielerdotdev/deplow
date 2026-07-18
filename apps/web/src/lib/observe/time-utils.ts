import type { TimePreset, TimeRange } from "@/lib/observe/context/types"
import { TIME_PRESET_MS } from "@/lib/observe/context/types"

const UNIT_MS: Record<string, number> = {
  m: 60_000,
  h: 60 * 60_000,
  d: 24 * 60 * 60_000,
  w: 7 * 24 * 60 * 60_000,
  mo: 30 * 24 * 60 * 60_000,
}

/** Parse shorthand like `5m`, `2h`, `4d`, `1w`, `2mo`, or `today` into a TimeRange. */
export function relativeToTimeRange(shorthand: string): TimeRange | null {
  const trimmed = shorthand.trim().toLowerCase()
  const now = Date.now()

  if (trimmed === "today") {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return {
      kind: "absolute",
      from: start.toISOString(),
      to: new Date(now).toISOString(),
    }
  }

  // Known presets
  if (trimmed in TIME_PRESET_MS) {
    return { kind: "preset", preset: trimmed as TimePreset }
  }

  const match = trimmed.match(/^(\d+)(mo|m|h|d|w)$/)
  if (!match) return null
  const amount = Number.parseInt(match[1]!, 10)
  const unit = match[2]!
  const ms = UNIT_MS[unit]
  if (!ms || !Number.isFinite(amount) || amount <= 0) return null

  // Prefer named presets when they match
  if (unit !== "mo") {
    const asPreset = `${amount}${unit}` as TimePreset
    if (asPreset in TIME_PRESET_MS) {
      return { kind: "preset", preset: asPreset }
    }
  }

  return {
    kind: "absolute",
    from: new Date(now - amount * ms).toISOString(),
    to: new Date(now).toISOString(),
  }
}

export function presetLabel(preset: TimePreset): string {
  const labels: Record<TimePreset, string> = {
    "1m": "Last 1m",
    "5m": "Last 5m",
    "15m": "Last 15m",
    "1h": "Last 1h",
    "6h": "Last 6h",
    "12h": "Last 12h",
    "24h": "Last 24h",
    "7d": "Last 7d",
    "14d": "Last 14d",
    "30d": "Last 30d",
  }
  return labels[preset] ?? `Last ${preset}`
}

export function formatTimeRangeDisplay(value: TimeRange): string {
  if (value.kind === "preset") return presetLabel(value.preset)
  try {
    const from = new Date(value.from)
    const to = new Date(value.to)
    const fmt = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    return `${fmt.format(from)} – ${fmt.format(to)}`
  } catch {
    return "Custom range"
  }
}

export function shorthandLabel(shorthand: string): string {
  const trimmed = shorthand.trim().toLowerCase()
  if (trimmed === "today") return "Today"
  const range = relativeToTimeRange(trimmed)
  if (range?.kind === "preset") return presetLabel(range.preset)
  const match = trimmed.match(/^(\d+)(mo|m|h|d|w)$/)
  if (!match) return shorthand
  const amount = match[1]!
  const unit = match[2]!
  const unitLabels: Record<string, [string, string]> = {
    m: ["minute", "minutes"],
    h: ["hour", "hours"],
    d: ["day", "days"],
    w: ["week", "weeks"],
    mo: ["month", "months"],
  }
  const [singular, plural] = unitLabels[unit] ?? [unit, unit]
  const n = Number.parseInt(amount, 10)
  return `Last ${n} ${n === 1 ? singular : plural}`
}

const RECENT_KEY = "observe.recentTimeRanges"
const MAX_RECENT = 6

export type RecentTimeRange = {
  label: string
  value: string
  range: TimeRange
}

export function loadRecentTimeRanges(): RecentTimeRange[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentTimeRange[]
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

export function pushRecentTimeRange(item: RecentTimeRange): RecentTimeRange[] {
  const prev = loadRecentTimeRanges().filter((r) => r.value !== item.value)
  const next = [item, ...prev].slice(0, MAX_RECENT)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}
