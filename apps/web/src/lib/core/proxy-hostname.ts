/**
 * Platform public hostname helpers.
 *
 * Production: `{slug}.{baseDomain}`
 * Preview (v2, reserved): `{previewPrefix}{previewKey}-{slug}.{baseDomain}`
 * e.g. pr-42-myapp.apps.example.com
 *
 * Production slugs must not collide with the preview prefix scheme.
 */

/** Reserved prefix so production slugs never look like preview hosts. */
export const PREVIEW_HOSTNAME_PREFIX = "pr-"

function cleanDomain(baseDomain: string): string {
  return baseDomain.replace(/^\.+/, "").replace(/\.$/, "")
}

export function productionHostname(slug: string, baseDomain: string): string {
  return `${slug}.${cleanDomain(baseDomain)}`
}

export function productionPublicUrl(
  slug: string,
  baseDomain: string,
  opts?: { protocol?: "https" | "http" },
): string {
  const protocol = opts?.protocol ?? "https"
  return `${protocol}://${productionHostname(slug, baseDomain)}`
}

/**
 * Preview hostname for v2 (not served in v1). Kept so route naming tests and
 * production slug validation stay aligned with the reserved scheme.
 */
export function previewHostname(
  slug: string,
  previewKey: string,
  baseDomain: string,
  prefix = PREVIEW_HOSTNAME_PREFIX,
): string {
  const key = previewKey.replace(/^pr-?/i, "")
  return `${prefix}${key}-${slug}.${cleanDomain(baseDomain)}`
}

/** True if a project slug would collide with the preview hostname scheme. */
export function slugCollidesWithPreviewPrefix(
  slug: string,
  prefix = PREVIEW_HOSTNAME_PREFIX,
): boolean {
  const normalized = slug.toLowerCase()
  const p = prefix.toLowerCase()
  if (normalized.startsWith(p)) return true
  if (normalized === p.replace(/-$/, "")) return true
  return false
}

/**
 * Validate a production project slug for proxy safety.
 * Throws if the slug would collide with reserved preview hostnames.
 */
export function assertProductionSlug(
  slug: string,
  prefix = PREVIEW_HOSTNAME_PREFIX,
): void {
  if (slugCollidesWithPreviewPrefix(slug, prefix)) {
    throw new Error(
      `Project slug "${slug}" collides with the reserved preview hostname prefix "${prefix}". Choose a different name.`,
    )
  }
}