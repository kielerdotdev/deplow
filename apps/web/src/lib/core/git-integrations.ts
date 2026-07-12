/**
 * Load / persist git integration config and provider links.
 * Uses injected DB accessors from the service layer.
 */

import type { GitHubAppConfig } from "./github-app"
import type { GitLabOAuthConfig } from "./gitlab-oauth"
import type { PlatformConfig } from "./platform-config"

export type StoredGitHubAppConfig = GitHubAppConfig & { slug?: string }

export function githubAppConfigFromEnv(
  config: PlatformConfig,
): GitHubAppConfig | null {
  if (
    !config.githubAppId ||
    !config.githubAppClientId ||
    !config.githubAppClientSecret ||
    !config.githubAppPrivateKey
  ) {
    return null
  }
  return {
    appId: config.githubAppId,
    clientId: config.githubAppClientId,
    clientSecret: config.githubAppClientSecret,
    privateKey: config.githubAppPrivateKey,
    webhookSecret: config.githubAppWebhookSecret || undefined,
    slug: config.githubAppSlug || undefined,
  }
}

export function gitlabOAuthConfigFromEnv(
  config: PlatformConfig,
): GitLabOAuthConfig | null {
  if (!config.gitlabOAuthClientId || !config.gitlabOAuthClientSecret) {
    return null
  }
  return {
    clientId: config.gitlabOAuthClientId,
    clientSecret: config.gitlabOAuthClientSecret,
    baseUrl: config.gitlabOAuthBaseUrl || "https://gitlab.com",
  }
}

export function parseRepoFullName(
  fullNameOrUrl: string,
): { owner: string; repo: string; fullName: string } | null {
  const trimmed = fullNameOrUrl.trim()

  // Try GitHub/GitLab URL patterns first
  const urlMatch = trimmed.match(
    /(?:github\.com|gitlab\.com)[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/i,
  )
  if (urlMatch) {
    const owner = urlMatch[1]!
    const repo = urlMatch[2]!
    return { owner, repo, fullName: `${owner}/${repo}` }
  }

  // Try plain owner/repo shorthand
  const parts = trimmed.replace(/\.git$/, "").split("/")
  if (parts.length === 2 && parts[0] && parts[1]) {
    return {
      owner: parts[0]!,
      repo: parts[1]!,
      fullName: `${parts[0]}/${parts[1]}`,
    }
  }

  return null
}

export function safeReturnTo(
  returnTo: string | null | undefined,
  publicBase: string,
): string {
  const fallback = "/projects"
  if (!returnTo) return fallback

  // Path-only (relative, not protocol-relative)
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo
  }

  // Absolute URL — only allow same-origin
  try {
    const u = new URL(returnTo)
    const base = new URL(publicBase)
    if (u.origin === base.origin) {
      return `${u.pathname}${u.search}${u.hash}`
    }
  } catch {
    // not a valid URL — fall through to fallback
  }
  return fallback
}
