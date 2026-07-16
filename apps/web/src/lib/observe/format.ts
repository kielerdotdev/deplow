/** Format request/error rates without lying about sparse traffic. */
export function formatRate(
  ratePerSec: number,
  opts?: { total?: number; decimals?: number },
): string {
  if (!Number.isFinite(ratePerSec) || ratePerSec < 0) return "—"
  if (ratePerSec === 0) {
    if (opts?.total != null && opts.total > 0) return "<0.01/s"
    return "0/s"
  }
  if (ratePerSec < 0.01) {
    const perHour = ratePerSec * 3600
    if (perHour >= 0.1) {
      const h =
        perHour >= 10 ? perHour.toFixed(0) : perHour.toFixed(1).replace(/\.0$/, "")
      return `~${h}/h`
    }
    return "<0.01/s"
  }
  const d = opts?.decimals ?? 2
  const s = ratePerSec.toFixed(d).replace(/\.?0+$/, "")
  return `${s}/s`
}

export function formatPercent(rate: number, decimals = 2): string {
  if (!Number.isFinite(rate)) return "—"
  if (rate === 0) return "0%"
  if (rate > 0 && rate < 0.01) return "<0.01%"
  return `${rate.toFixed(decimals).replace(/\.?0+$/, "")}%`
}

/** Human timestamp with millisecond precision (local). */
export function formatTimestampMs(
  input: string | number | Date,
  opts?: { relative?: boolean; now?: number },
): string {
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return "—"
  if (opts?.relative) {
    return formatRelative(d.getTime(), opts.now ?? Date.now())
  }
  const pad = (n: number, w = 2) => String(n).padStart(w, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

export function formatRelative(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 48) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  return `${days}d ago`
}

/** Deduplicate / uniquify axis tick labels after rounding. */
export function formatAxisTick(value: number, unit?: "rate" | "count" | "ms"): string {
  if (!Number.isFinite(value)) return ""
  if (unit === "ms") {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}s`
    return `${Math.round(value)}`
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k`
  }
  if (value === 0) return "0"
  if (Math.abs(value) < 0.01) return value.toExponential(0)
  if (Math.abs(value) < 1) {
    // Prefer enough precision to distinguish nearby ticks
    const s = value.toPrecision(2)
    return String(Number(s))
  }
  return String(Number(value.toFixed(1)))
}

export function uniqueAxisTicks(values: number[], unit?: "rate" | "count" | "ms"): string[] {
  const labels = values.map((v) => formatAxisTick(v, unit))
  const seen = new Map<string, number>()
  return labels.map((label, i) => {
    const n = (seen.get(label) ?? 0) + 1
    seen.set(label, n)
    if (n === 1) return label
    // Disambiguate collisions with higher precision
    return formatAxisTick(values[i]!, unit === "ms" ? "ms" : undefined) + "\u200b".repeat(n)
  })
}
