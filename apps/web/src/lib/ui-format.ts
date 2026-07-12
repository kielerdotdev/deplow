/**
 * UI formatting helpers. Humanized deploy errors live in core (testable pure).
 */

import { summarizeDeployError as coreSummarize } from "@/lib/core/user-error"

export { isExpectedDeployFailure } from "@/lib/core/user-error"

export function summarizeDeployError(
  raw: string | null | undefined,
  options?: { maxLength?: number },
): string {
  return coreSummarize(raw, options)
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (iso == null || iso === "") return "—"
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

/** Relative time for status lines ("12s ago"). Falls back to formatDateTime. */
export function formatRelativeTime(
  iso: string | Date | null | undefined,
  nowMs = Date.now(),
): string {
  if (iso == null || iso === "") return "—"
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const delta = Math.max(0, Math.floor((nowMs - d.getTime()) / 1000))
  if (delta < 60) return `${delta}s ago`
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
  if (delta < 86_400) return `${Math.floor(delta / 3600)}h ago`
  if (delta < 86_400 * 14) return `${Math.floor(delta / 86_400)}d ago`
  return formatDateTime(iso)
}

/** owner/repo from https://github.com/owner/repo.git */
export function repoShortName(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const parts = u.pathname
      .replace(/\.git$/, "")
      .split("/")
      .filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
    }
    return parts[parts.length - 1] ?? url
  } catch {
    const m = url.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
    return m?.[1] ?? url
  }
}
