/**
 * GitLab OAuth Application helpers.
 * Supports gitlab.com and self-hosted via baseUrl.
 */

import { randomBytes } from "node:crypto"

export type GitLabOAuthConfig = {
  clientId: string
  clientSecret: string
  /** e.g. https://gitlab.com */
  baseUrl: string
}

export type FetchLike = typeof fetch

function apiBase(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/v4`
}

function cleanBase(base: string): string {
  return base.replace(/\/$/, "")
}

async function assertOk(
  res: Response,
  label: string,
  bodySlice = 200,
): Promise<void> {
  if (res.ok) return
  const body = await res.text()
  throw new Error(`${label} (${res.status}): ${body.slice(0, bodySlice)}`)
}

export function gitlabOAuthAuthorizeUrl(input: {
  config: GitLabOAuthConfig
  redirectUri: string
  state: string
}): string {
  const u = new URL(`${cleanBase(input.config.baseUrl)}/oauth/authorize`)
  u.searchParams.set("client_id", input.config.clientId)
  u.searchParams.set("redirect_uri", input.redirectUri)
  u.searchParams.set("response_type", "code")
  u.searchParams.set("state", input.state)
  u.searchParams.set("scope", "read_api read_repository write_repository")
  return u.toString()
}

export async function exchangeGitLabOAuthCode(input: {
  config: GitLabOAuthConfig
  code: string
  redirectUri: string
  fetchImpl?: FetchLike
}): Promise<{
  accessToken: string
  refreshToken?: string
  expiresIn?: number
}> {
  const fetchImpl = input.fetchImpl ?? fetch
  const res = await fetchImpl(`${cleanBase(input.config.baseUrl)}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      code: input.code,
      grant_type: "authorization_code",
      redirect_uri: input.redirectUri,
    }),
  })
  await assertOk(res, "GitLab OAuth token exchange failed")
  const data = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

export async function refreshGitLabToken(input: {
  config: GitLabOAuthConfig
  refreshToken: string
  fetchImpl?: FetchLike
}): Promise<{
  accessToken: string
  refreshToken?: string
  expiresIn?: number
}> {
  const fetchImpl = input.fetchImpl ?? fetch
  const res = await fetchImpl(`${cleanBase(input.config.baseUrl)}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
    }),
  })
  await assertOk(res, "GitLab token refresh failed")
  const data = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

export async function fetchGitLabUser(input: {
  config: GitLabOAuthConfig
  accessToken: string
  fetchImpl?: FetchLike
}): Promise<{ id: string; login: string; avatarUrl: string | null }> {
  const fetchImpl = input.fetchImpl ?? fetch
  const res = await fetchImpl(`${apiBase(input.config.baseUrl)}/user`, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "User-Agent": "deplow",
    },
  })
  await assertOk(res, "GitLab /user failed")
  const data = (await res.json()) as {
    id: number
    username: string
    avatar_url?: string
  }
  return {
    id: String(data.id),
    login: data.username,
    avatarUrl: data.avatar_url ?? null,
  }
}

export async function createGitLabProjectHook(input: {
  config: GitLabOAuthConfig
  accessToken: string
  /** Numeric project id or URL-encoded path */
  projectId: string
  webhookUrl: string
  secret: string
  fetchImpl?: FetchLike
}): Promise<{ id: string }> {
  const fetchImpl = input.fetchImpl ?? fetch
  const url = `${apiBase(input.config.baseUrl)}/projects/${encodeURIComponent(input.projectId)}/hooks`
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": "deplow",
    },
    body: JSON.stringify({
      url: input.webhookUrl,
      token: input.secret,
      push_events: true,
      enable_ssl_verification: true,
    }),
  })
  await assertOk(res, "Could not create GitLab webhook", 240)
  const data = (await res.json()) as { id: number }
  return { id: String(data.id) }
}

export async function deleteGitLabProjectHook(input: {
  config: GitLabOAuthConfig
  accessToken: string
  projectId: string
  hookId: string
  fetchImpl?: FetchLike
}): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch
  const url = `${apiBase(input.config.baseUrl)}/projects/${encodeURIComponent(input.projectId)}/hooks/${encodeURIComponent(input.hookId)}`
  const res = await fetchImpl(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "User-Agent": "deplow",
    },
  })
  if (!res.ok && res.status !== 404) {
    await assertOk(res, "Could not delete GitLab webhook")
  }
}

export function randomOAuthState(): string {
  return randomBytes(24).toString("base64url")
}