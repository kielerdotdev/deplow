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
