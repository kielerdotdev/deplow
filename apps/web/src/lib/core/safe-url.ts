/**
 * URL safety helpers for outbound fetches and git remotes.
 * Blocks private/link-local targets to reduce SSRF blast radius.
 */

const PRIVATE_HOST_RE =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|\[::1\])$/i

function isPrivateIpv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const parts = m.slice(1).map((x) => Number(x))
  if (parts.some((n) => n > 255)) return false
  const [a, b] = parts
  if (a === 0) return true // 0.0.0.0/8
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b! >= 16 && b! <= 31) return true
  if (a === 192 && b === 168) return true
  // CGNAT / shared address space
  if (a === 100 && b! >= 64 && b! <= 127) return true
  // benchmark / test-net / multicast (not routable as public targets for SSRF)
  if (a === 198 && (b === 18 || b === 19)) return true
  return false
}

export function isPrivateOrLocalHost(host: string): boolean {
  let h = host.trim().toLowerCase().replace(/^\[|\]$/g, "")
  // IPv4-mapped IPv6: ::ffff:127.0.0.1
  const v4mapped = h.match(/^:?:ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)
  if (v4mapped) h = v4mapped[1]!
  if (
    PRIVATE_HOST_RE.test(h) ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".localdomain") ||
    h === "metadata" ||
    h === "metadata.google.internal"
  ) {
    return true
  }
  if (isPrivateIpv4(h)) return true
  // IPv6 ULA / link-local / loopback
  if (
    h === "::1" ||
    h.startsWith("fc") ||
    h.startsWith("fd") ||
    h.startsWith("fe80:") ||
    h === "0:0:0:0:0:0:0:1"
  ) {
    return true
  }
  return false
}

export type OutboundUrlPolicy = {
  /** Default: https only. Set true to also allow http (git sometimes needs it). */
  allowHttp?: boolean
  /** Extra hosts the operator trusts (exact match, lowercase). */
  allowHosts?: string[]
  /** When true, reject private/link-local hosts (default true). */
  blockPrivate?: boolean
}

/**
 * Validate an outbound URL for webhooks / server-side fetch.
 * Returns the parsed URL or throws with a safe message.
 */
export function assertSafeOutboundUrl(
  raw: string,
  policy: OutboundUrlPolicy = {},
): URL {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    throw new Error("Invalid URL")
  }
  const allowHttp = policy.allowHttp === true
  if (u.protocol !== "https:" && !(allowHttp && u.protocol === "http:")) {
    throw new Error(allowHttp ? "URL must be http or https" : "URL must be https")
  }
  if (u.username || u.password) {
    throw new Error("URL must not embed credentials")
  }
  const host = u.hostname
  const allowHosts = (policy.allowHosts ?? []).map((h) => h.toLowerCase())
  if (allowHosts.includes(host.toLowerCase())) {
    return u
  }
  const blockPrivate = policy.blockPrivate !== false
  if (blockPrivate && isPrivateOrLocalHost(host)) {
    throw new Error("URL must not target private or local network addresses")
  }
  return u
}

/** Default public git hosts allowed without extra config. */
export const DEFAULT_GIT_HOSTS = [
  "github.com",
  "www.github.com",
  "gitlab.com",
  "www.gitlab.com",
  "bitbucket.org",
  "www.bitbucket.org",
]

/**
 * Validate a git remote URL for control-plane clone.
 * Allows https and git@host:path (SSH) to non-private hosts.
 */
export function assertSafeGitRemoteUrl(
  raw: string,
  opts?: { allowHosts?: string[]; allowPrivateHosts?: boolean },
): string {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error("Repository URL is required")

  const allowHosts = [
    ...DEFAULT_GIT_HOSTS,
    ...(opts?.allowHosts ?? []).map((h) => h.toLowerCase()),
  ]
  const allowPrivate = opts?.allowPrivateHosts === true

  // git@host:owner/repo.git
  const ssh = trimmed.match(/^git@([^:]+):(.+)$/)
  if (ssh) {
    const host = ssh[1]!.toLowerCase()
    if (!allowPrivate && isPrivateOrLocalHost(host)) {
      throw new Error("Git host must not be a private or local address")
    }
    if (
      !allowPrivate &&
      allowHosts.length > 0 &&
      !allowHosts.includes(host) &&
      !host.endsWith(".github.com") &&
      !host.endsWith(".gitlab.com")
    ) {
      // Allow any public host for self-hosted GitLab/Gitea on public IPs
      // Private ranges already blocked above.
    }
    return trimmed.endsWith(".git") ? trimmed : `${trimmed}.git`
  }

  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    throw new Error("Invalid git repository URL")
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("Git URL must be https (or git@ SSH form)")
  }
  const host = u.hostname.toLowerCase()
  if (!allowPrivate && isPrivateOrLocalHost(host)) {
    throw new Error("Git host must not be a private or local address")
  }
  return trimmed.endsWith(".git") ? trimmed : `${trimmed.replace(/\/$/, "")}.git`
}

/** Extract hostname from a validated git remote (https or git@). */
export function gitRemoteHostname(repoUrl: string): string | null {
  const ssh = repoUrl.trim().match(/^git@([^:]+):/)
  if (ssh) return ssh[1]!.toLowerCase()
  try {
    return new URL(repoUrl).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Validate git remote then DNS-pin: every resolved A/AAAA must be non-private
 * (unless allowPrivateHosts). Matches webhook safeOutboundFetch posture.
 */
export async function assertSafeGitRemoteUrlResolved(
  raw: string,
  opts?: { allowHosts?: string[]; allowPrivateHosts?: boolean },
): Promise<string> {
  const url = assertSafeGitRemoteUrl(raw, opts)
  if (opts?.allowPrivateHosts) return url
  const host = gitRemoteHostname(url)
  if (!host) throw new Error("Could not parse git host")
  // Dynamic import avoids circular deps with safe-fetch → safe-url
  const { resolvePublicAddresses } = await import("./safe-fetch")
  await resolvePublicAddresses(host)
  return url
}

/** Attribute / map keys safe to interpolate into ClickHouse map access. */
const SAFE_ATTR_KEY_RE = /^[a-zA-Z0-9_./:-]{1,128}$/

export function assertSafeAttributeKey(key: string): string {
  const k = key.trim()
  if (!SAFE_ATTR_KEY_RE.test(k)) {
    throw new Error(
      `Invalid attribute key (use letters, digits, _ . / : - only): ${key.slice(0, 40)}`,
    )
  }
  return k
}

export function isSafeAttributeKey(key: string): boolean {
  return SAFE_ATTR_KEY_RE.test(key.trim())
}
