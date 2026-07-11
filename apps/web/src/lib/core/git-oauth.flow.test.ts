/**
 * End-to-end flow tests for git OAuth / App / clone auth (mocked network + git).
 * These must pass without real GitHub/GitLab credentials.
 */
import { generateKeyPairSync } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createGitHubAppJwt,
  createRepoWebhook,
  exchangeGitHubOAuthCode,
  fetchGitHubUser,
  getInstallationAccessToken,
  listInstallationRepos,
  listUserInstallations,
} from "./github-app"
import {
  resolveProjectCloneAuth,
  resolveUserListToken,
  type ResolveGitAuthDeps,
} from "./git-credentials"
import { GitService } from "./git.service"
import {
  gitAuthConfigEnv,
  redactSecrets,
} from "./git-clone-auth"
import { parseRepoFullName, safeReturnTo } from "./git-integrations"
import {
  createGitLabProjectHook,
  exchangeGitLabOAuthCode,
} from "./gitlab-oauth"
import { encryptString, decryptString } from "./crypto"

const SECRET = "test-secrets-key-for-git-oauth-e2e"

function mockFetch(handlers: Array<{
  match: (url: string, init?: RequestInit) => boolean
  response: () => Response | Promise<Response>
}>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    for (const h of handlers) {
      if (h.match(url, init)) return h.response()
    }
    throw new Error(`Unhandled fetch: ${url} ${init?.method ?? "GET"}`)
  }) as unknown as typeof fetch
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("git oauth e2e flow (mocked)", () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs) {
      try {
        rmSync(d, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
    dirs.length = 0
  })

  it("GitHub App: JWT → installation token → list repos → webhook → clone auth", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    })

    const app = {
      appId: "42",
      clientId: "Iv1.client",
      clientSecret: "secret",
      privateKey,
      slug: "deplow-test",
    }

    // JWT must be valid shape
    const jwt = createGitHubAppJwt(app.appId, privateKey)
    expect(jwt.split(".")).toHaveLength(3)

    const fetchImpl = mockFetch([
      {
        match: (u, init) =>
          u.includes("/app/installations/99/access_tokens") &&
          init?.method === "POST",
        response: () =>
          jsonResponse({
            token: "ghs_install_token_abc",
            expires_at: new Date(Date.now() + 3600_000).toISOString(),
          }),
      },
      {
        match: (u) => u.includes("/installation/repositories"),
        response: () =>
          jsonResponse({
            repositories: [
              {
                id: 1,
                full_name: "acme/api",
                name: "api",
                owner: { login: "acme" },
                private: true,
                default_branch: "main",
                clone_url: "https://github.com/acme/api.git",
                html_url: "https://github.com/acme/api",
                description: "private app",
                updated_at: "2026-01-01T00:00:00Z",
              },
            ],
          }),
      },
      {
        match: (u, init) =>
          u.includes("/repos/acme/api/hooks") && init?.method === "POST",
        response: () => jsonResponse({ id: 555 }),
      },
      {
        match: (u, init) =>
          u.includes("/login/oauth/access_token") && init?.method === "POST",
        response: () =>
          jsonResponse({
            access_token: "gho_user_token",
            token_type: "bearer",
            scope: "read:user",
          }),
      },
      {
        match: (u) => u.endsWith("/user") && !u.includes("installations"),
        response: () =>
          jsonResponse({
            id: 7,
            login: "alice",
            avatar_url: "https://avatars.example/alice",
          }),
      },
      {
        match: (u) => u.includes("/user/installations"),
        response: () =>
          jsonResponse({
            installations: [
              {
                id: 99,
                account: { login: "acme", type: "Organization" },
              },
            ],
          }),
      },
    ])

    // OAuth exchange + user + installations
    const oauth = await exchangeGitHubOAuthCode({
      config: app,
      code: "code123",
      fetchImpl,
    })
    expect(oauth.accessToken).toBe("gho_user_token")

    const user = await fetchGitHubUser({
      accessToken: oauth.accessToken,
      fetchImpl,
    })
    expect(user.login).toBe("alice")

    const installs = await listUserInstallations({
      userAccessToken: oauth.accessToken,
      fetchImpl,
    })
    expect(installs[0]?.id).toBe("99")

    const { token: installToken } = await getInstallationAccessToken({
      config: app,
      installationId: "99",
      fetchImpl,
    })
    expect(installToken).toBe("ghs_install_token_abc")

    const repos = await listInstallationRepos({
      installationToken: installToken,
      fetchImpl,
    })
    expect(repos).toHaveLength(1)
    expect(repos[0]!.private).toBe(true)
    expect(repos[0]!.fullName).toBe("acme/api")

    const hook = await createRepoWebhook({
      installationToken: installToken,
      owner: "acme",
      repo: "api",
      webhookUrl: "https://cp.example/api/webhooks/git/proj-1",
      secret: "whsec",
      fetchImpl,
    })
    expect(hook.id).toBe("555")

    // Resolve clone auth via github_app method
    const deps: ResolveGitAuthDeps = {
      decrypt: (p) => decryptString(p, SECRET),
      encrypt: (p) => encryptString(p, SECRET),
      loadGitHubAppConfig: async () => app,
      loadGitLabOAuthConfig: async () => null,
      loadUserLink: async () => ({
        provider: "github",
        accessTokenEncrypted: encryptString("gho_user_token", SECRET),
        refreshTokenEncrypted: null,
        expiresAt: null,
        githubInstallationId: "99",
      }),
      platformGithubToken: undefined,
      fetchImpl,
    }

    const listTok = await resolveUserListToken(
      { userId: "u1", provider: "github" },
      deps,
    )
    expect(listTok.source).toBe("github_app")
    expect(listTok.token).toBe("ghs_install_token_abc")

    const cloneAuth = await resolveProjectCloneAuth(
      {
        gitProvider: "github",
        gitRepoUrl: "https://github.com/acme/api.git",
        gitAuthMethod: "github_app",
        gitInstallationId: "99",
        gitAccessTokenEncrypted: null,
        ownerId: "u1",
      },
      deps,
    )
    expect(cloneAuth?.token).toBe("ghs_install_token_abc")
    expect(cloneAuth?.username).toBe("x-access-token")

    // GitService must pass auth env and never leak token in logs
    const calls: Array<{ args: string[]; env?: Record<string, string> }> = []
    const cloneRoot = mkdtempSync(path.join(tmpdir(), "deplow-git-"))
    dirs.push(cloneRoot)
    const service = new GitService(cloneRoot, async (_cmd, args, _cwd, env) => {
      calls.push({ args, env })
      // simulate successful clone by creating dest when last arg is path
      const dest = args[args.length - 1]!
      if (args[0] === "clone") {
        mkdirSync(path.join(dest, ".git"), { recursive: true })
        writeFileSync(path.join(dest, "README"), "ok")
      }
      return { code: 0, stdout: "Cloning into...\n", stderr: "" }
    })

    const result = await service.syncRepo({
      projectId: "proj-1",
      repoUrl: "https://github.com/acme/api.git",
      branch: "main",
      auth: { token: cloneAuth!.token, provider: "github" },
    })
    expect(result.sourcePath).toContain("proj-1")
    expect(calls[0]!.env?.GIT_CONFIG_VALUE_0).toContain("AUTHORIZATION: basic")
    expect(calls[0]!.args).not.toContain(cloneAuth!.token)
    expect(result.logs).not.toContain(cloneAuth!.token)
  })

  it("PAT advanced path resolves clone auth and redacts secrets", async () => {
    const pat = "ghp_super_secret_pat_value_12345"
    const deps: ResolveGitAuthDeps = {
      decrypt: (p) => decryptString(p, SECRET),
      encrypt: (p) => encryptString(p, SECRET),
      loadGitHubAppConfig: async () => null,
      loadGitLabOAuthConfig: async () => null,
      loadUserLink: async () => null,
      platformGithubToken: undefined,
    }
    const auth = await resolveProjectCloneAuth(
      {
        gitProvider: "github",
        gitRepoUrl: "https://github.com/acme/api.git",
        gitAuthMethod: "pat",
        gitInstallationId: null,
        gitAccessTokenEncrypted: encryptString(pat, SECRET),
        ownerId: "u1",
      },
      deps,
    )
    expect(auth?.token).toBe(pat)
    const env = gitAuthConfigEnv({ token: pat, host: "github.com" })
    expect(env.GIT_CONFIG_KEY_0).toContain("github.com")
    expect(
      redactSecrets(`fatal: https://x-access-token:${pat}@github.com/x`, [pat]),
    ).not.toContain(pat)
  })

  it("platform token is last-resort list/clone auth", async () => {
    const deps: ResolveGitAuthDeps = {
      decrypt: (p) => p,
      encrypt: (p) => p,
      loadGitHubAppConfig: async () => null,
      loadGitLabOAuthConfig: async () => null,
      loadUserLink: async () => null,
      platformGithubToken: "ghp_platform",
    }
    const list = await resolveUserListToken(
      { userId: "u1", provider: "github" },
      deps,
    )
    expect(list).toEqual({ token: "ghp_platform", source: "platform" })
    const clone = await resolveProjectCloneAuth(
      {
        gitProvider: "github",
        gitRepoUrl: "https://github.com/a/b.git",
        gitAuthMethod: "platform",
        gitInstallationId: null,
        gitAccessTokenEncrypted: null,
        ownerId: "u1",
      },
      deps,
    )
    expect(clone?.token).toBe("ghp_platform")
  })

  it("GitLab OAuth exchange + project hook create", async () => {
    const fetchImpl = mockFetch([
      {
        match: (u, init) => u.includes("/oauth/token") && init?.method === "POST",
        response: () =>
          jsonResponse({
            access_token: "glpat-oauth",
            refresh_token: "refresh-1",
            expires_in: 7200,
          }),
      },
      {
        match: (u, init) =>
          u.includes("/projects/acme%2Fapi/hooks") && init?.method === "POST",
        response: () => jsonResponse({ id: 88 }),
      },
    ])
    const config = {
      clientId: "cid",
      clientSecret: "sec",
      baseUrl: "https://gitlab.com",
    }
    const tok = await exchangeGitLabOAuthCode({
      config,
      code: "c",
      redirectUri: "https://cp.example/api/git/oauth/gitlab/callback",
      fetchImpl,
    })
    expect(tok.accessToken).toBe("glpat-oauth")
    const hook = await createGitLabProjectHook({
      config,
      accessToken: tok.accessToken,
      projectId: "acme/api",
      webhookUrl: "https://cp.example/hook",
      secret: "s",
      fetchImpl,
    })
    expect(hook.id).toBe("88")
  })

  it("parseRepoFullName and safeReturnTo guard open redirects", () => {
    expect(parseRepoFullName("https://github.com/acme/api.git")).toEqual({
      owner: "acme",
      repo: "api",
      fullName: "acme/api",
    })
    expect(parseRepoFullName("acme/api")?.fullName).toBe("acme/api")
    expect(safeReturnTo("/projects/x", "https://cp.example")).toBe(
      "/projects/x",
    )
    expect(
      safeReturnTo("https://evil.example/phish", "https://cp.example"),
    ).toBe("/projects")
    expect(
      safeReturnTo("https://cp.example/integrations", "https://cp.example"),
    ).toBe("/integrations")
  })

  it("fails clearly when no credentials for list", async () => {
    const deps: ResolveGitAuthDeps = {
      decrypt: (p) => p,
      encrypt: (p) => p,
      loadGitHubAppConfig: async () => null,
      loadGitLabOAuthConfig: async () => null,
      loadUserLink: async () => null,
    }
    await expect(
      resolveUserListToken({ userId: "u1", provider: "github" }, deps),
    ).rejects.toThrow(/Connect GitHub|PAT|DEPLOW_GITHUB_TOKEN/)
  })

  it("real git clone of public repo (network)", async () => {
    const cloneRoot = mkdtempSync(path.join(tmpdir(), "deplow-real-git-"))
    dirs.push(cloneRoot)
    const service = new GitService(cloneRoot)
    const result = await service.syncRepo({
      projectId: "hello-world",
      repoUrl: "https://github.com/octocat/Hello-World.git",
      branch: "master",
    })
    expect(result.sourcePath).toContain("hello-world")
    // README exists in that fixture repo
    const { existsSync } = await import("node:fs")
    expect(existsSync(path.join(result.sourcePath, "README"))).toBe(true)

    // Second sync uses fetch+reset path
    const again = await service.syncRepo({
      projectId: "hello-world",
      repoUrl: "https://github.com/octocat/Hello-World.git",
      branch: "master",
    })
    expect(again.sourcePath).toBe(result.sourcePath)
  }, 60_000)
})
