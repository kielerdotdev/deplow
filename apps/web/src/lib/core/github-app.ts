/**
 * GitHub App helpers: JWT, installation tokens, repos, webhooks.
 * Framework-agnostic; inject fetch for tests.
 */

import { createPrivateKey, createSign, randomBytes } from "node:crypto"

export type GitHubAppConfig = {
  appId: string
  clientId: string
  clientSecret: string
  /** PEM private key (PKCS#1 or PKCS#8) */
  privateKey: string
  webhookSecret?: string
  /** App slug for install URLs, if known */
  slug?: string
}

export type FetchLike = typeof fetch

const GITHUB_API_VERSION = "2022-11-28"
const GITHUB_ACCEPT = "application/vnd.github+json"

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: GITHUB_ACCEPT,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "deplow",
  }
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

/**
 * Create a short-lived RS256 JWT for GitHub App authentication.
 * Valid ~9 minutes (GitHub allows max 10).
 */
export function createGitHubAppJwt(
  appId: string,
  privateKeyPem: string,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = b64url(
    JSON.stringify({
      iat: nowSec - 60,
      exp: nowSec + 9 * 60,
      iss: appId,
    }),
  )
  const data = `${header}.${payload}`
  const key = createPrivateKey(normalizePem(privateKeyPem))
  const signer = createSign("RSA-SHA256")
  signer.update(data)
  signer.end()
  const sig = b64url(signer.sign(key))
  return `${data}.${sig}`
}

function normalizePem(pem: string): string {
  let p = pem.trim()
  if (p.includes("\\n") && !p.includes("\n")) {
    p = p.replace(/\\n/g, "\n")
  }
  return p
}

export async function getInstallationAccessToken(input: {
  config: GitHubAppConfig
  installationId: string | number
  fetchImpl?: FetchLike
}): Promise<{ token: string; expiresAt: string }> {
  const fetchImpl = input.fetchImpl ?? fetch
  const jwt = createGitHubAppJwt(input.config.appId, input.config.privateKey)
  const res = await fetchImpl(
    `https://api.github.com/app/installations/${input.installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: GITHUB_ACCEPT,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": "deplow",
      },
    },
  )
  await assertOk(res, "GitHub installation token failed")
  const data = (await res.json()) as { token: string; expires_at: string }
  return { token: data.token, expiresAt: data.expires_at }
}

export async function listInstallationRepos(input: {
  installationToken: string
  query?: string
  maxPages?: number
  fetchImpl?: FetchLike
}): Promise<
  Array<{
    id: string
    fullName: string
    name: string
    owner: string
    description: string | null
    private: boolean
    defaultBranch: string
    cloneUrl: string
    htmlUrl: string
    updatedAt: string | null
  }>
> {
  const fetchImpl = input.fetchImpl ?? fetch
  const maxPages = input.maxPages ?? 3
  const all: Array<Record<string, unknown>> = []
  let page = 1

  while (page <= maxPages) {
    const url = new URL("https://api.github.com/installation/repositories")
    url.searchParams.set("per_page", "100")
    url.searchParams.set("page", String(page))
    const res = await fetchImpl(url, { headers: githubHeaders(input.installationToken) })
    await assertOk(res, "GitHub list installation repos failed")
    const data = (await res.json()) as {
      repositories?: Array<Record<string, unknown>>
    }
    const batch = data.repositories ?? []
    all.push(...batch)
    if (batch.length < 100) break
    page++
  }

  return all.map(mapGithubRepo).filter((r) => matchesQuery(r, input.query))
}

function mapGithubRepo(r: Record<string, unknown>) {
  const fullName = String(r.full_name ?? "")
  const [owner, name] = fullName.split("/")
  return {
    id: String(r.id ?? fullName),
    fullName,
    name: String(r.name ?? name ?? ""),
    owner: String(
      (r.owner as { login?: string } | undefined)?.login ?? owner ?? "",
    ),
    description: (r.description as string | null) ?? null,
    private: Boolean(r.private),
    defaultBranch: String(r.default_branch ?? "main"),
    cloneUrl: String(r.clone_url ?? `https://github.com/${fullName}.git`),
    htmlUrl: String(r.html_url ?? `https://github.com/${fullName}`),
    updatedAt: (r.updated_at as string | null) ?? null,
  }
}

function matchesQuery(
  r: { fullName: string; description: string | null },
  query?: string,
): boolean {
  const q = query?.trim().toLowerCase()
  if (!q) return true
  return (
    r.fullName.toLowerCase().includes(q) ||
    (r.description?.toLowerCase().includes(q) ?? false)
  )
}

export async function listUserInstallations(input: {
  userAccessToken: string
  fetchImpl?: FetchLike
}): Promise<
  Array<{
    id: string
    accountLogin: string
    accountType: string
  }>
> {
  const fetchImpl = input.fetchImpl ?? fetch
  const res = await fetchImpl("https://api.github.com/user/installations", {
    headers: githubHeaders(input.userAccessToken),
  })
  await assertOk(res, "GitHub list installations failed")
  const data = (await res.json()) as {
    installations?: Array<{
      id: number
      account?: { login?: string; type?: string }
    }>
  }
  return (data.installations ?? []).map((i) => ({
    id: String(i.id),
    accountLogin: i.account?.login ?? "",
    accountType: i.account?.type ?? "User",
  }))
}

export async function exchangeGitHubOAuthCode(input: {
  config: GitHubAppConfig
  code: string
  fetchImpl?: FetchLike
}): Promise<{ accessToken: string; tokenType: string; scope: string }> {
  const fetchImpl = input.fetchImpl ?? fetch
  const res = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "deplow",
    },
    body: JSON.stringify({
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      code: input.code,
    }),
  })
  await assertOk(res, "GitHub OAuth token exchange failed")

  const data = (await res.json()) as {
    access_token?: string
    token_type?: string
    scope?: string
    error?: string
    error_description?: string
  }
  if (!data.access_token) {
    throw new Error(
      data.error_description || data.error || "GitHub OAuth did not return an access token",
    )
  }
  return {
    accessToken: data.access_token,
    tokenType: data.token_type ?? "bearer",
    scope: data.scope ?? "",
  }
}

export async function fetchGitHubUser(input: {
  accessToken: string
  fetchImpl?: FetchLike
}): Promise<{ id: string; login: string; avatarUrl: string | null }> {
  const fetchImpl = input.fetchImpl ?? fetch
  const res = await fetchImpl("https://api.github.com/user", {
    headers: githubHeaders(input.accessToken),
  })
  await assertOk(res, "GitHub /user failed")
  const data = (await res.json()) as {
    id: number
    login: string
    avatar_url?: string
  }
  return {
    id: String(data.id),
    login: data.login,
    avatarUrl: data.avatar_url ?? null,
  }
}

export async function createRepoWebhook(input: {
  installationToken: string
  owner: string
  repo: string
  webhookUrl: string
  secret: string
  fetchImpl?: FetchLike
}): Promise<{ id: string }> {
  const fetchImpl = input.fetchImpl ?? fetch
  const url = `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/hooks`
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      ...githubHeaders(input.installationToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "web",
      active: true,
      events: ["push"],
      config: {
        url: input.webhookUrl,
        content_type: "json",
        secret: input.secret,
        insecure_ssl: "0",
      },
    }),
  })
  await assertOk(res, "Could not create GitHub webhook", 240)
  const data = (await res.json()) as { id: number }
  return { id: String(data.id) }
}

export async function deleteRepoWebhook(input: {
  installationToken: string
  owner: string
  repo: string
  hookId: string
  fetchImpl?: FetchLike
}): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch
  const res = await fetchImpl(
    `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/hooks/${encodeURIComponent(input.hookId)}`,
    {
      method: "DELETE",
      headers: githubHeaders(input.installationToken),
    },
  )
  if (!res.ok && res.status !== 404) {
    await assertOk(res, "Could not delete GitHub webhook", 200)
  }
}

export function githubOAuthAuthorizeUrl(input: {
  clientId: string
  redirectUri?: string
  state: string
}): string {
  const u = new URL("https://github.com/login/oauth/authorize")
  u.searchParams.set("client_id", input.clientId)
  if (input.redirectUri) {
    u.searchParams.set("redirect_uri", input.redirectUri)
  }
  u.searchParams.set("state", input.state)
  u.searchParams.set("scope", "read:user")
  return u.toString()
}

export function githubAppDeleteSettingsUrl(slug?: string): string {
  if (!slug) return "https://github.com/settings/apps"
  return `https://github.com/settings/apps/${slug}/advanced`
}

export async function uninstallAllGitHubAppInstallations(input: {
  config: GitHubAppConfig
  fetchImpl?: FetchLike
}): Promise<{ uninstalled: string[]; errors: string[] }> {
  const fetchImpl = input.fetchImpl ?? fetch
  const jwt = createGitHubAppJwt(input.config.appId, input.config.privateKey)
  const res = await fetchImpl("https://api.github.com/app/installations", {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: GITHUB_ACCEPT,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "deplow",
    },
  })
  await assertOk(res, "GitHub list app installations failed")
  const data = (await res.json()) as Array<{
    id: number
    account?: { login?: string }
  }>

  const uninstalled: string[] = []
  const errors: string[] = []

  for (const inst of data) {
    const login = inst.account?.login ?? String(inst.id)
    const delRes = await fetchImpl(
      `https://api.github.com/app/installations/${inst.id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: GITHUB_ACCEPT,
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
          "User-Agent": "deplow",
        },
      },
    )
    if (delRes.ok || delRes.status === 404) {
      uninstalled.push(login)
    } else {
      errors.push(`${login} (${delRes.status})`)
    }
  }

  return { uninstalled, errors }
}

export function githubAppInstallUrl(slug?: string): string | null {
  if (!slug) return null
  return `https://github.com/apps/${slug}/installations/new`
}

/**
 * GitHub rejects App webhook URLs that are not on the public Internet
 * (localhost, .local, RFC1918, etc.). OAuth callback URLs may still be local.
 */
export function isPublicInternetUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    const host = u.hostname.toLowerCase()
    if (isPrivateHost(host)) return false
    return true
  } catch {
    return false
  }
}

function isPrivateHost(host: string): boolean {
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true
  }
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)) return true
  if (/^169\.254\.\d+\.\d+$/.test(host)) return true
  return false
}

/**
 * Build GitHub App manifest for self-serve registration.
 */
export function buildGitHubAppManifest(input: {
  name: string
  publicUrl: string
  description?: string
}): Record<string, unknown> {
  const base = input.publicUrl.replace(/\/$/, "") || "http://localhost:3000"
  const publicNet = isPublicInternetUrl(base)

  const manifest: Record<string, unknown> = {
    name: input.name.slice(0, 34),
    description:
      input.description ?? "deplow — self-hosted deploy with gVisor-sandboxed apps",
    url: base,
    redirect_url: `${base}/api/git/github/app-manifest/callback`,
    callback_urls: [
      `${base}/api/git/oauth/github/callback`,
      "http://localhost:3000/api/git/oauth/github/callback",
    ],
    setup_url: `${base}/integrations`,
    public: false,
    default_permissions: {
      contents: "read",
      metadata: "read",
      repository_hooks: "write",
    },
  }

  if (publicNet) {
    manifest.hook_attributes = {
      url: `${base}/api/webhooks/github-app`,
      active: true,
    }
    manifest.default_events = ["push"]
  }

  return manifest
}

export function randomOAuthState(): string {
  return randomBytes(24).toString("base64url")
}

/**
 * Complete manifest conversion: POST code to GitHub, receive App credentials.
 */
export async function completeGitHubAppManifest(input: {
  code: string
  fetchImpl?: FetchLike
}): Promise<{
  appId: string
  clientId: string
  clientSecret: string
  privateKey: string
  webhookSecret: string
  slug: string
}> {
  const fetchImpl = input.fetchImpl ?? fetch
  const res = await fetchImpl(
    `https://api.github.com/app-manifests/${encodeURIComponent(input.code)}/conversions`,
    {
      method: "POST",
      headers: {
        Accept: GITHUB_ACCEPT,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": "deplow",
      },
    },
  )
  await assertOk(res, "GitHub App manifest conversion failed", 240)
  const data = (await res.json()) as {
    id: number
    client_id: string
    client_secret: string
    pem: string
    webhook_secret: string
    slug: string
  }
  return {
    appId: String(data.id),
    clientId: data.client_id,
    clientSecret: data.client_secret,
    privateKey: data.pem,
    webhookSecret: data.webhook_secret,
    slug: data.slug,
  }
}

export const GITHUB_OAUTH_CALLBACK_PATH = "/api/git/oauth/github/callback"

export function githubOAuthCallbackUrls(publicUrl: string): string[] {
  const base = publicUrl.replace(/\/$/, "")
  return [`${base}${GITHUB_OAUTH_CALLBACK_PATH}`, "http://localhost:3000/api/git/oauth/github/callback"]
}

/**
 * Get authenticated app metadata from GitHub (app JWT, not installation token).
 * Returns the app's slug and name for display / deletion URL construction.
 */
export async function getAuthenticatedGitHubApp(input: {
  config: GitHubAppConfig
  fetchImpl?: FetchLike
}): Promise<{ slug: string; name: string }> {
  const fetchImpl = input.fetchImpl ?? fetch
  const jwt = createGitHubAppJwt(input.config.appId, input.config.privateKey)
  const res = await fetchImpl("https://api.github.com/app", {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: GITHUB_ACCEPT,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "deplow",
    },
  })
  await assertOk(res, "GitHub /app failed")
  const data = (await res.json()) as {
    slug: string
    name: string
  }
  return { slug: data.slug, name: data.name }
}

/**
 * List installations for this GitHub App (app-level, uses app JWT).
 * Different from listUserInstallations which uses a user access token.
 */
export async function listAppInstallations(input: {
  config: GitHubAppConfig
  fetchImpl?: FetchLike
}): Promise<
  Array<{
    id: string
    accountLogin: string
    accountType: string
  }>
> {
  const fetchImpl = input.fetchImpl ?? fetch
  const jwt = createGitHubAppJwt(input.config.appId, input.config.privateKey)
  const res = await fetchImpl("https://api.github.com/app/installations", {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: GITHUB_ACCEPT,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "deplow",
    },
  })
  await assertOk(res, "GitHub list app installations failed")
  const data = (await res.json()) as Array<{
    id: number
    account?: { login?: string; type?: string }
  }>
  return data.map((i) => ({
    id: String(i.id),
    accountLogin: i.account?.login ?? "",
    accountType: i.account?.type ?? "User",
  }))
}