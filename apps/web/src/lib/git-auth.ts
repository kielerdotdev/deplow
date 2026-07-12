/**
 * Server-side wiring for git OAuth / App credentials (uses DB + platform config).
 */

import { and, eq } from "@deplow/db"
import {
  gitProviderLinks,
  githubAppInstallations,
  oauthStates,
  platformIntegrations,
} from "@deplow/db"

import {
  decryptString,
  encryptString,
  githubAppConfigFromEnv,
  gitlabOAuthConfigFromEnv,
  resolveProjectCloneAuth,
  resolveUserListToken,
  type ProjectGitAuthRow,
  type ResolveGitAuthDeps,
} from "@/lib/core"
import type { GitHubAppConfig } from "@/lib/core/github-app"
import type { GitLabOAuthConfig } from "@/lib/core/gitlab-oauth"
import { db, platformConfig } from "@/lib/services"

function secretKey(): string {
  return platformConfig.secretsEncryptionKey
}

// ── config loading ──────────────────────────────────────────────

export async function loadGitHubAppConfig(): Promise<GitHubAppConfig | null> {
  const [row] = await db
    .select()
    .from(platformIntegrations)
    .where(eq(platformIntegrations.provider, "github_app"))

  if (row?.configEncrypted) {
    const parsed = tryDecryptConfig<GitHubAppConfig & { slug?: string }>(
      row.configEncrypted,
    )
    if (parsed?.appId && parsed.clientId && parsed.privateKey) {
      return parsed
    }
  }
  return githubAppConfigFromEnv(platformConfig)
}

export async function loadGitLabOAuthConfig(): Promise<GitLabOAuthConfig | null> {
  const [row] = await db
    .select()
    .from(platformIntegrations)
    .where(eq(platformIntegrations.provider, "gitlab_oauth"))

  if (row?.configEncrypted) {
    const parsed = tryDecryptConfig<GitLabOAuthConfig>(row.configEncrypted)
    if (parsed?.clientId && parsed.clientSecret) {
      return {
        ...parsed,
        baseUrl: parsed.baseUrl || platformConfig.gitlabOAuthBaseUrl,
      }
    }
  }
  return gitlabOAuthConfigFromEnv(platformConfig)
}

// ── config saving (upsert pattern) ──────────────────────────────

export async function saveGitHubAppConfig(
  config: GitHubAppConfig & { slug?: string },
): Promise<void> {
  await upsertIntegration(
    "github_app",
    encryptString(JSON.stringify(config), secretKey()),
  )
}

export async function saveGitLabOAuthConfig(
  config: GitLabOAuthConfig,
): Promise<void> {
  await upsertIntegration(
    "gitlab_oauth",
    encryptString(JSON.stringify(config), secretKey()),
  )
}

async function upsertIntegration(
  provider: string,
  configEncrypted: string,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(platformIntegrations)
    .where(eq(platformIntegrations.provider, provider))

  if (existing) {
    await db
      .update(platformIntegrations)
      .set({ configEncrypted })
      .where(eq(platformIntegrations.provider, provider))
    return
  }
  await db.insert(platformIntegrations).values({ provider, configEncrypted })
}

// ── credential resolution ────────────────────────────────────────

export function createResolveGitAuthDeps(): ResolveGitAuthDeps {
  return {
    decrypt: (p) => decryptString(p, secretKey()),
    encrypt: (p) => encryptString(p, secretKey()),
    loadGitHubAppConfig,
    loadGitLabOAuthConfig,
    loadUserLink,
    updateUserLinkTokens,
    platformGithubToken: platformConfig.githubToken || undefined,
    platformGitlabToken: platformConfig.gitlabToken || undefined,
  }
}

export async function resolveCloneAuthForProject(project: ProjectGitAuthRow) {
  return resolveProjectCloneAuth(project, createResolveGitAuthDeps())
}

export async function resolveListTokenForUser(input: {
  userId: string
  provider: "github" | "gitlab"
  explicitToken?: string
  installationId?: string
}) {
  return resolveUserListToken(input, createResolveGitAuthDeps())
}

// ── provider link upsert ────────────────────────────────────────

export async function upsertGitProviderLink(input: {
  userId: string
  provider: "github" | "gitlab"
  providerUserId: string
  login: string
  avatarUrl?: string | null
  accessToken: string
  refreshToken?: string | null
  expiresAt?: Date | null
  githubInstallationId?: string | null
  scopes?: string | null
}): Promise<void> {
  const [existing] = await db
    .select()
    .from(gitProviderLinks)
    .where(
      and(
        eq(gitProviderLinks.userId, input.userId),
        eq(gitProviderLinks.provider, input.provider),
      ),
    )

  const values = {
    providerUserId: input.providerUserId,
    login: input.login,
    avatarUrl: input.avatarUrl ?? null,
    accessTokenEncrypted: encryptString(input.accessToken, secretKey()),
    refreshTokenEncrypted: input.refreshToken
      ? encryptString(input.refreshToken, secretKey())
      : null,
    expiresAt: input.expiresAt ?? null,
    githubInstallationId: input.githubInstallationId ?? null,
    scopes: input.scopes ?? null,
  }

  if (existing) {
    await db
      .update(gitProviderLinks)
      .set(values)
      .where(eq(gitProviderLinks.id, existing.id))
    return
  }
  await db.insert(gitProviderLinks).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    provider: input.provider,
    ...values,
  })
}

// ── GitHub installation upsert ──────────────────────────────────

export async function upsertGithubInstallation(input: {
  installationId: string
  accountLogin: string
  accountType: string
  linkedUserId: string
}): Promise<void> {
  const [existing] = await db
    .select()
    .from(githubAppInstallations)
    .where(eq(githubAppInstallations.installationId, input.installationId))

  const values = {
    accountLogin: input.accountLogin,
    accountType: input.accountType,
    linkedUserId: input.linkedUserId,
    suspendedAt: null,
  }

  if (existing) {
    await db
      .update(githubAppInstallations)
      .set(values)
      .where(eq(githubAppInstallations.installationId, input.installationId))
    return
  }
  await db.insert(githubAppInstallations).values({
    installationId: input.installationId,
    ...values,
  })
}

// ── OAuth state management ───────────────────────────────────────

export async function createOAuthState(input: {
  userId: string
  provider: string
  returnTo?: string
  state: string
  ttlMs?: number
}): Promise<void> {
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? 15 * 60_000))
  await db.insert(oauthStates).values({
    state: input.state,
    userId: input.userId,
    provider: input.provider,
    returnTo: input.returnTo ?? null,
    expiresAt,
  })
}

export async function consumeOAuthState(state: string): Promise<{
  userId: string
  provider: string
  returnTo: string | null
} | null> {
  // Atomic delete-and-return via a single query chain.
  // Drizzle doesn't support RETURNING on DELETE across all dialects,
  // so we select first, then delete. This is safe because the state
  // value is a high-entropy random string (not guessable).
  const [row] = await db
    .select()
    .from(oauthStates)
    .where(eq(oauthStates.state, state))

  if (!row) return null
  await db.delete(oauthStates).where(eq(oauthStates.state, state))
  if (row.expiresAt.getTime() < Date.now()) return null

  return {
    userId: row.userId,
    provider: row.provider,
    returnTo: row.returnTo,
  }
}

// ── user link queries ────────────────────────────────────────────

export async function listUserGitLinks(userId: string) {
  return db
    .select()
    .from(gitProviderLinks)
    .where(eq(gitProviderLinks.userId, userId))
}

export async function deleteUserGitLink(
  userId: string,
  provider: "github" | "gitlab",
): Promise<void> {
  await db
    .delete(gitProviderLinks)
    .where(
      and(
        eq(gitProviderLinks.userId, userId),
        eq(gitProviderLinks.provider, provider),
      ),
    )
}

async function loadUserLink(
  userId: string,
  provider: string,
): Promise<{
  provider: string
  accessTokenEncrypted: string | null
  refreshTokenEncrypted: string | null
  expiresAt: Date | null
  githubInstallationId: string | null
} | null> {
  const [row] = await db
    .select()
    .from(gitProviderLinks)
    .where(
      and(
        eq(gitProviderLinks.userId, userId),
        eq(gitProviderLinks.provider, provider as "github" | "gitlab"),
      ),
    )
  if (!row) return null
  return {
    provider: row.provider,
    accessTokenEncrypted: row.accessTokenEncrypted,
    refreshTokenEncrypted: row.refreshTokenEncrypted,
    expiresAt: row.expiresAt,
    githubInstallationId: row.githubInstallationId,
  }
}

async function updateUserLinkTokens(input: {
  userId: string
  provider: string
  accessTokenEncrypted: string
  refreshTokenEncrypted?: string | null
  expiresAt?: Date | null
}): Promise<void> {
  await db
    .update(gitProviderLinks)
    .set({
      accessTokenEncrypted: input.accessTokenEncrypted,
      refreshTokenEncrypted: input.refreshTokenEncrypted ?? null,
      expiresAt: input.expiresAt ?? null,
    })
    .where(
      and(
        eq(gitProviderLinks.userId, input.userId),
        eq(gitProviderLinks.provider, input.provider as "github" | "gitlab"),
      ),
    )
}

// ── helpers ──────────────────────────────────────────────────────

function tryDecryptConfig<T>(encrypted: string): T | null {
  try {
    return JSON.parse(decryptString(encrypted, secretKey())) as T
  } catch {
    return null
  }
}

// ── integration state queries ───────────────────────────────────

export async function hasGitHubAppInDatabase(): Promise<boolean> {
  const [row] = await db
    .select()
    .from(platformIntegrations)
    .where(eq(platformIntegrations.provider, "github_app"))
  return Boolean(row?.configEncrypted)
}

export async function clearGitHubAppLocalState(): Promise<void> {
  await db
    .delete(platformIntegrations)
    .where(eq(platformIntegrations.provider, "github_app"))
}

export async function clearGitLabOAuthLocalState(): Promise<void> {
  await db
    .delete(platformIntegrations)
    .where(eq(platformIntegrations.provider, "gitlab_oauth"))
}

export { platformConfig }
