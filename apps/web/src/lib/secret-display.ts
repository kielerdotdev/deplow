/** Mask a secret/URL for list displays — keep a short suffix for recognition. */
export function maskSecret(value: string, visibleSuffix = 4): string {
  const trimmed = value.trim()
  if (!trimmed) return "••••••••"
  if (trimmed.length <= visibleSuffix) {
    return "•".repeat(Math.max(8, trimmed.length))
  }
  const suffix = trimmed.slice(-visibleSuffix)
  return `••••••••••••••••${suffix}`
}

export function maskEmail(email: string): string {
  const at = email.indexOf("@")
  if (at <= 1) return maskSecret(email, 2)
  const local = email.slice(0, at)
  const domain = email.slice(at)
  const keep = Math.min(2, local.length)
  return `${local.slice(0, keep)}${"•".repeat(Math.max(4, local.length - keep))}${domain}`
}
