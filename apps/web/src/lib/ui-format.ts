/** Short user-facing error from long build/tool output. */
export function summarizeDeployError(message: string): string {
  const lines = message
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

  const cross = lines.find((l) => l.includes("❌"))
  const key =
    cross ??
    lines.find(
      (l) =>
        /could not determine|is not installed|is not available/i.test(l) ||
        l.startsWith("Error"),
    ) ??
    lines.find((l) => /failed|error:/i.test(l))
  const pick = (key ?? lines[0] ?? "Deploy failed")
    .replace(/^❌\s*/, "")
    .replace(/^⚠️\s*/, "")
  return pick.length > 140 ? `${pick.slice(0, 137)}…` : pick
}

/** Stable date string for SSR (avoids locale hydration mismatches). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

/** Relative time for client-side status ("12s ago"). Falls back to formatDateTime. */
export function formatRelativeTime(
  iso: string | null | undefined,
  nowMs = Date.now(),
): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const delta = Math.max(0, Math.floor((nowMs - d.getTime()) / 1000))
  if (delta < 60) return `${delta}s ago`
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
  if (delta < 86_400) return `${Math.floor(delta / 3600)}h ago`
  if (delta < 86_400 * 14) return `${Math.floor(delta / 86_400)}d ago`
  return formatDateTime(iso)
}
export function repoShortName(
  repoUrl: string | null | undefined,
): string | null {
  if (!repoUrl) return null
  try {
    const u = new URL(repoUrl)
    const parts = u.pathname
      .replace(/\.git$/, "")
      .split("/")
      .filter(Boolean)
    if (parts.length >= 2)
      return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
    return parts[0] ?? repoUrl
  } catch {
    const m = repoUrl.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
    return m?.[1] ?? repoUrl
  }
}
