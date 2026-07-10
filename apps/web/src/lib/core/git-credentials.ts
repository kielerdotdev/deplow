import type { GitCloneAuth } from "./git-clone-auth"
import { defaultGitUsername, hostFromRepoUrl } from "./git-clone-auth"
import {
  getInstallationAccessToken,
  type GitHubAppConfig,
} from "./github-app"
import {
  refreshGitLabToken,
  type GitLabOAuthConfig,
} from "./gitlab-oauth"

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

function resolveProvider(
  project: ProjectGitAuthRow,
): "github" | "gitlab" {
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
  return {
    token: deps.decrypt(project.gitAccessTokenEncrypted),
    username,
    host,
  }
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
    (await deps.loadUserLink(project.ownerId, "github"))
      ?.githubInstallationId
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

  const token = await maybeRefreshGitLabToken(project, deps, link)
  return { token, username, host }
}

async function maybeRefreshGitLabToken(
  project: ProjectGitAuthRow,
  deps: ResolveGitAuthDeps,
  link: GitProviderLinkRow,
): Promise<string> {
  const provider = (project.gitProvider as "github" | "gitlab") || "github"
  const token = deps.decrypt(link.accessTokenEncrypted!)

  if (provider !== "gitlab") return token
  if (!link.refreshTokenEncrypted) return token
  if (!link.expiresAt) return token
  if (link.expiresAt.getTime() >= Date.now() + 60_000) return token

  const gl = await deps.loadGitLabOAuthConfig()
  if (!gl) return token

  const refreshed = await refreshGitLabToken({
    config: gl,
    refreshToken: deps.decrypt(link.refreshTokenEncrypted),
    fetchImpl: deps.fetchImpl,
  })
  await deps.updateUserLinkTokens?.({
    userId: project.ownerId,
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
  if (input.explicitToken?.trim()) {
    return { token: input.explicitToken.trim(), source: "explicit" }
  }

  if (input.provider === "github") {
    return resolveGithubListToken(input, deps)
  }
  return resolveGitlabListToken(input, deps)
}

async function resolveGithubListToken(
  input: { userId: string; installationId?: string },
  deps: ResolveGitAuthDeps,
): Promise<{
  token: string
  source: "explicit" | "github_app" | "oauth" | "platform"
  installationId?: string
}> {
  const link = await deps.loadUserLink(input.userId, "github")
  const installationId =
    input.installationId || link?.githubInstallationId || undefined

  if (installationId) {
    const app = await deps.loadGitHubAppConfig()
    if (app) {
      const { token } = await getInstallationAccessToken({
        config: app,
        installationId,
        fetchImpl: deps.fetchImpl,
      })
      return { token, source: "github_app", installationId }
    }
  }

  if (link?.accessTokenEncrypted) {
    return {
      token: deps.decrypt(link.accessTokenEncrypted),
      source: "oauth",
      installationId: link.githubInstallationId ?? undefined,
    }
  }

  if (deps.platformGithubToken) {
    return { token: deps.platformGithubToken, source: "platform" }
  }

  throw new Error(
    "Connect GitHub (OAuth / App install), paste a PAT under Advanced, or set DEPLOW_GITHUB_TOKEN on the server.",
  )
}

async function resolveGitlabListToken(
  input: { userId: string },
  deps: ResolveGitAuthDeps,
): Promise<{
  token: string
  source: "explicit" | "github_app" | "oauth" | "platform"
}> {
  const link = await deps.loadUserLink(input.userId, "gitlab")
  if (link?.accessTokenEncrypted) {
    return {
      token: deps.decrypt(link.accessTokenEncrypted),
      source: "oauth",
    }
  }
  if (deps.platformGitlabToken) {
    return { token: deps.platformGitlabToken, source: "platform" }
  }
  throw new Error(
    "Connect GitLab (OAuth), paste a PAT under Advanced, or set DEPLOW_GITLAB_TOKEN on the server.",
  )
}