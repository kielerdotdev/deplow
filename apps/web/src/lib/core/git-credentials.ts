import type { GitCloneAuth } from "./git-clone-auth"
import { defaultGitUsername, hostFromRepoUrl } from "./git-clone-auth"
import {
  getInstallationAccessToken,
  refreshGitHubUserToken,
  type GitHubAppConfig,
} from "./github-app"
import { refreshGitLabToken, type GitLabOAuthConfig } from "./gitlab-oauth"

export type ProjectGitAuthRow = {
  gitProvider: string | null
  gitRepoUrl: string | null
  gitAuthMethod: string | null
  gitInstallationId: string | null
  gitAccessTokenEncrypted: string | null
  ownerId: string
}

export type GitProviderLinkRow = {
  provider: string
  accessTokenEncrypted: string | null
  refreshTokenEncrypted: string | null
  expiresAt: Date | null
  githubInstallationId: string | null
}

export const STALE_GITHUB_CREDS_MESSAGE =
  "Stored GitHub connection could not be read. Reconnect GitHub under Integrations, or paste a PAT under Advanced."

export const STALE_GITLAB_CREDS_MESSAGE =
  "Stored GitLab connection could not be read. Reconnect GitLab under Integrations, or paste a PAT under Advanced."

export const EXPIRED_GITHUB_TOKEN_MESSAGE =
  "GitHub rejected the stored credentials. Reconnect GitHub (or Switch account) in the repo selector — a stale personal access token may be overriding the connection."

export const EXPIRED_GITLAB_TOKEN_MESSAGE =
  "GitLab rejected the stored credentials. Reconnect GitLab in the repo selector, or paste a new PAT under Advanced."

export type ResolveGitAuthDeps = {
  decrypt: (payload: string) => string
  encrypt: (plaintext: string) => string
  loadGitHubAppConfig: () => Promise<GitHubAppConfig | null>
  loadGitLabOAuthConfig: () => Promise<GitLabOAuthConfig | null>
  loadUserLink: (
    userId: string,
    provider: string,
  ) => Promise<GitProviderLinkRow | null>
  updateUserLinkTokens?: (input: {
    userId: string
    provider: string
    accessTokenEncrypted: string
    refreshTokenEncrypted?: string | null
    expiresAt?: Date | null
  }) => Promise<void>
  platformGithubToken?: string
  platformGitlabToken?: string
  fetchImpl?: typeof fetch
}

function safeDecrypt(deps: ResolveGitAuthDeps, encrypted: string): string | null {
  try {
    return deps.decrypt(encrypted)
  } catch {
    return null
  }
}

// ── resolveProjectCloneAuth ──────────────────────────────────────

/**
 * Resolve a short-lived or stored token for git clone / provider API.
 * Tries each auth source in priority order. Returns null when none apply.
 */
export async function resolveProjectCloneAuth(
  project: ProjectGitAuthRow,
  deps: ResolveGitAuthDeps,
): Promise<GitCloneAuth | null> {
  const provider = resolveProvider(project)
  const host = resolveHost(project, provider)
  const username = defaultGitUsername(provider)

  // 1. Project-scoped PAT (advanced)
  const patAuth = await tryProjectPat(project, deps, host, username)
  if (patAuth) return patAuth

  // 2. GitHub App installation
  const appAuth = await tryGitHubApp(project, deps, host)
  if (appAuth) return appAuth

  // 3. User OAuth link (GitLab / GitHub user token)
  const oauthAuth = await tryUserLink(project, deps, provider, host, username)
  if (oauthAuth) return oauthAuth

  // 4. Platform PAT fallback
  return tryPlatformPat(deps, provider, host, username)
}

function resolveProvider(project: ProjectGitAuthRow): "github" | "gitlab" {
  return (project.gitProvider as "github" | "gitlab") || "github"
}

function resolveHost(
  project: ProjectGitAuthRow,
  provider: "github" | "gitlab",
): string {
  if (project.gitRepoUrl) return hostFromRepoUrl(project.gitRepoUrl)
  return provider === "gitlab" ? "gitlab.com" : "github.com"
}

async function tryProjectPat(
  project: ProjectGitAuthRow,
  deps: ResolveGitAuthDeps,
  host: string,
  username: string,
): Promise<GitCloneAuth | null> {
  if (!project.gitAccessTokenEncrypted) return null
  const token = safeDecrypt(deps, project.gitAccessTokenEncrypted)
  if (!token) return null
  return { token, username, host }
}

async function tryGitHubApp(
  project: ProjectGitAuthRow,
  deps: ResolveGitAuthDeps,
  host: string,
): Promise<GitCloneAuth | null> {
  const provider = (project.gitProvider as "github" | "gitlab") || "github"
  if (provider !== "github") return null
  if (project.gitAuthMethod !== "github_app" && !project.gitInstallationId) {
    return null
  }

  const installationId =
    project.gitInstallationId ||
    (await deps.loadUserLink(project.ownerId, "github"))?.githubInstallationId
  if (!installationId) return null

  const app = await deps.loadGitHubAppConfig()
  if (!app) return null

  const { token } = await getInstallationAccessToken({
    config: app,
    installationId,
    fetchImpl: deps.fetchImpl,
  })
  return { token, username: "x-access-token", host }
}

async function tryUserLink(
  project: ProjectGitAuthRow,
  deps: ResolveGitAuthDeps,
  provider: "github" | "gitlab",
  host: string,
  username: string,
): Promise<GitCloneAuth | null> {
  const link = await deps.loadUserLink(project.ownerId, provider)
  if (!link?.accessTokenEncrypted) return null

  const token = await maybeRefreshUserOAuthToken(
    project.ownerId,
    provider,
    deps,
    link,
  )
  if (!token) return null
  return { token, username, host }
}

/**
 * Refresh expiring GitLab / GitHub App user tokens when near expiry.
 * Classic non-expiring tokens (no refresh/expires) are returned as-is.
 */
async function maybeRefreshUserOAuthToken(
  userId: string,
  provider: "github" | "gitlab",
  deps: ResolveGitAuthDeps,
  link: GitProviderLinkRow,
): Promise<string | null> {
  const token = safeDecrypt(deps, link.accessTokenEncrypted!)
  if (!token) return null

  if (!link.refreshTokenEncrypted) return token
  if (!link.expiresAt) return token
  // Refresh one minute before expiry
  if (link.expiresAt.getTime() >= Date.now() + 60_000) return token

  const refreshToken = safeDecrypt(deps, link.refreshTokenEncrypted)
  if (!refreshToken) return token

  try {
    if (provider === "gitlab") {
      const gl = await deps.loadGitLabOAuthConfig()
      if (!gl) return token
      const refreshed = await refreshGitLabToken({
        config: gl,
        refreshToken,
        fetchImpl: deps.fetchImpl,
      })
      await deps.updateUserLinkTokens?.({
        userId,
        provider: "gitlab",
        accessTokenEncrypted: deps.encrypt(refreshed.accessToken),
        refreshTokenEncrypted: refreshed.refreshToken
          ? deps.encrypt(refreshed.refreshToken)
          : link.refreshTokenEncrypted,
        expiresAt: refreshed.expiresIn
          ? new Date(Date.now() + refreshed.expiresIn * 1000)
          : null,
      })
      return refreshed.accessToken
    }

    if (provider === "github") {
      const app = await deps.loadGitHubAppConfig()
      if (!app) return token
      const refreshed = await refreshGitHubUserToken({
        config: app,
        refreshToken,
        fetchImpl: deps.fetchImpl,
      })
      await deps.updateUserLinkTokens?.({
        userId,
        provider: "github",
        accessTokenEncrypted: deps.encrypt(refreshed.accessToken),
        refreshTokenEncrypted: refreshed.refreshToken
          ? deps.encrypt(refreshed.refreshToken)
          : link.refreshTokenEncrypted,
        expiresAt: refreshed.expiresIn
          ? new Date(Date.now() + refreshed.expiresIn * 1000)
          : null,
      })
      return refreshed.accessToken
    }
  } catch {
    // Fall through with existing token; caller may still get 401 and surface reconnect.
    return token
  }

  return token
}

function tryPlatformPat(
  deps: ResolveGitAuthDeps,
  provider: "github" | "gitlab",
  host: string,
  username: string,
): GitCloneAuth | null {
  const platform =
    provider === "github" ? deps.platformGithubToken : deps.platformGitlabToken
  if (!platform) return null
  return { token: platform, username, host }
}

// ── resolveUserListToken ─────────────────────────────────────────

export async function resolveUserListToken(
  input: {
    userId: string
    provider: "github" | "gitlab"
    explicitToken?: string
    installationId?: string
  },
  deps: ResolveGitAuthDeps,
): Promise<{
  token: string
  source: "explicit" | "github_app" | "oauth" | "platform"
  installationId?: string
}> {
  if (input.provider === "github") {
    return resolveGithubListToken(input, deps)
  }
  return resolveGitlabListToken(input, deps)
}

async function resolveGithubListToken(
  input: {
    userId: string
    installationId?: string
    explicitToken?: string
  },
  deps: ResolveGitAuthDeps,
): Promise<{
  token: string
  source: "explicit" | "github_app" | "oauth" | "platform"
  installationId?: string
}> {
  const link = await deps.loadUserLink(input.userId, "github")
  const installationId =
    input.installationId || link?.githubInstallationId || undefined

  // 1. GitHub App installation tokens are short-lived and re-minted each call.
  // Prefer them over a session-stored PAT so a stale Advanced token cannot
  // permanently break an otherwise healthy connection.
  if (installationId) {
    const app = await deps.loadGitHubAppConfig()
    if (app) {
      try {
        const { token } = await getInstallationAccessToken({
          config: app,
          installationId,
          fetchImpl: deps.fetchImpl,
        })
        return { token, source: "github_app", installationId }
      } catch {
        // Fall through to OAuth / explicit PAT
      }
    }
  }

  // 2. Explicit PAT only when no working installation (Advanced path)
  if (input.explicitToken?.trim()) {
    return { token: input.explicitToken.trim(), source: "explicit" }
  }

  // 3. User OAuth token (refresh when near expiry)
  if (link?.accessTokenEncrypted) {
    const token = await maybeRefreshUserOAuthToken(
      input.userId,
      "github",
      deps,
      link,
    )
    if (token) {
      return {
        token,
        source: "oauth",
        installationId: link.githubInstallationId ?? undefined,
      }
    }
  }

  if (deps.platformGithubToken) {
    return { token: deps.platformGithubToken, source: "platform" }
  }

  throw new Error(
    link?.accessTokenEncrypted
      ? STALE_GITHUB_CREDS_MESSAGE
      : "Connect GitHub (OAuth / App install) or paste a PAT under Advanced. " +
          "Platform HOSTRIG_GITHUB_TOKEN is only shared when HOSTRIG_GIT_PLATFORM_TOKEN_SHARED=1.",
  )
}

async function resolveGitlabListToken(
  input: { userId: string; explicitToken?: string },
  deps: ResolveGitAuthDeps,
): Promise<{
  token: string
  source: "explicit" | "github_app" | "oauth" | "platform"
}> {
  // Prefer linked OAuth (with refresh) over a stale session PAT when both exist
  const link = await deps.loadUserLink(input.userId, "gitlab")
  if (link?.accessTokenEncrypted) {
    const token = await maybeRefreshUserOAuthToken(
      input.userId,
      "gitlab",
      deps,
      link,
    )
    if (token) {
      return { token, source: "oauth" }
    }
  }

  if (input.explicitToken?.trim()) {
    return { token: input.explicitToken.trim(), source: "explicit" }
  }

  if (deps.platformGitlabToken) {
    return { token: deps.platformGitlabToken, source: "platform" }
  }
  throw new Error(
    link?.accessTokenEncrypted
      ? STALE_GITLAB_CREDS_MESSAGE
      : "Connect GitLab (OAuth) or paste a PAT under Advanced. " +
          "Platform HOSTRIG_GITLAB_TOKEN is only shared when HOSTRIG_GIT_PLATFORM_TOKEN_SHARED=1.",
  )
}
