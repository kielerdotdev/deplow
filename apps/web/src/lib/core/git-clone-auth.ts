/**
 * Authenticated git clone helpers (framework-agnostic).
 * Prefer GIT_CONFIG_* extraheader over embedding tokens in argv URLs.
 */

export type GitCloneAuth = {
  token: string
  /** GitHub: x-access-token; GitLab OAuth: oauth2 */
  username?: string
  /** Hostname for http.extraheader scope, e.g. github.com */
  host?: string
}

/**
 * Build env vars so `git` authenticates to HTTPS hosts without prompting.
 * Uses Git 2.31+ GIT_CONFIG_COUNT injection.
 */
export function gitAuthConfigEnv(
  auth: GitCloneAuth,
): Record<string, string> {
  const host = auth.host ?? "github.com"
  const username = auth.username ?? "x-access-token"
  const basic = Buffer.from(`${username}:${auth.token}`, "utf8").toString(
    "base64",
  )
  return {
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: `http.https://${host}/.extraheader`,
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
  }
}

/** Infer git HTTPS host from a clone URL. */
export function hostFromRepoUrl(repoUrl: string): string {
  try {
    return new URL(repoUrl).hostname
  } catch {
    if (repoUrl.includes("gitlab")) return "gitlab.com"
    return "github.com"
  }
}

/** Default git HTTP username for a provider. */
export function defaultGitUsername(
  provider: "github" | "gitlab" | string,
): string {
  return provider === "gitlab" ? "oauth2" : "x-access-token"
}

/**
 * Fallback: embed credentials in HTTPS URL (avoid when possible — process lists).
 * Still useful for some edge clients.
 */
export function authenticatedCloneUrl(
  repoUrl: string,
  auth: GitCloneAuth,
): string {
  const username = encodeURIComponent(auth.username ?? "x-access-token")
  const token = encodeURIComponent(auth.token)
  try {
    const u = new URL(repoUrl)
    u.username = username
    u.password = token
    return u.toString()
  } catch {
    return repoUrl
  }
}

/** Strip known secrets from logs / error messages. */
export function redactSecrets(text: string, secrets: string[]): string {
  let out = text
  for (const secret of secrets) {
    if (!secret || secret.length < 4) continue
    out = out.split(secret).join("***")
  }
  // Also redact common URL-embedded patterns
  out = out.replace(
    /https?:\/\/[^/@\s]+:[^/@\s]+@/gi,
    "https://***:***@",
  )
  out = out.replace(/AUTHORIZATION:\s*basic\s+[A-Za-z0-9+/=]+/gi, "AUTHORIZATION: basic ***")
  return out
}
