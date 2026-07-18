/**
 * Display helpers for the Issues list — keep long paths and messages scannable.
 */

/** Prefer the last meaningful path segments over absolute monorepo noise. */
export function formatIssueCulprit(
  culprit: string | null | undefined,
  maxLen = 64,
): string | null {
  if (!culprit?.trim()) return null
  let s = culprit.trim()

  // Docs / external URLs → host + short path (return early — not a file path)
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s)
      const path = u.pathname.replace(/\/$/, "") || "/"
      const short = path.length > 28 ? `…${path.slice(-24)}` : path
      s = `${u.hostname}${short}`
      if (s.length > maxLen) return `${s.slice(0, maxLen - 1)}…`
      return s
    }
  } catch {
    // keep raw
  }

  // Absolute filesystem / monorepo paths → leaf file (and symbol if present)
  if (s.startsWith("/") || /^[A-Za-z]:[\\/]/.test(s) || s.includes("/")) {
    const parts = s.split(/[/\\]/).filter(Boolean)
    if (parts.length >= 2) {
      const file = parts[parts.length - 1]!
      s = file.includes(":")
        ? file
        : parts.length >= 3
          ? `…/${parts[parts.length - 2]}/${file}`
          : file
    }
  }

  if (s.length > maxLen) {
    return `${s.slice(0, maxLen - 1)}…`
  }
  return s
}

/** Soft two-line preview for issue titles (full text stays in title attr). */
export function issueTitlePreview(title: string, maxLen = 160): string {
  const t = title.replace(/\s+/g, " ").trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen - 1)}…`
}

export type IssueLevelTone = "error" | "warning" | "info" | "default"

export function issueLevelTone(
  level: string | null | undefined,
): IssueLevelTone {
  const l = (level ?? "").toLowerCase()
  if (l === "fatal" || l === "critical" || l === "error") return "error"
  if (l === "warning" || l === "warn") return "warning"
  if (l === "info" || l === "debug" || l === "log") return "info"
  return "default"
}

export const issueLevelBadgeClass: Record<IssueLevelTone, string> = {
  error:
    "bg-destructive/12 text-destructive ring-1 ring-inset ring-destructive/20",
  warning: "bg-warning/12 text-warning ring-1 ring-inset ring-warning/20",
  info: "bg-info/12 text-info ring-1 ring-inset ring-info/20",
  default: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
}
