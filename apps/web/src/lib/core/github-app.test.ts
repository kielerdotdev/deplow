import { generateKeyPairSync } from "node:crypto"
import { describe, expect, it } from "vitest"

import {
  buildGitHubAppManifest,
  createGitHubAppJwt,
  githubAppDeleteSettingsUrl,
  githubOAuthAuthorizeUrl,
  uninstallAllGitHubAppInstallations,
} from "./github-app"

describe("createGitHubAppJwt", () => {
  it("produces a 3-part RS256 JWT", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    })
    const jwt = createGitHubAppJwt("12345", privateKey)
    const parts = jwt.split(".")
    expect(parts).toHaveLength(3)
    const payload = JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString("utf8"),
    ) as { iss: string; exp: number; iat: number }
    expect(payload.iss).toBe("12345")
    expect(payload.exp).toBeGreaterThan(payload.iat)
  })
})

describe("buildGitHubAppManifest", () => {
  it("uses repository_hooks permission and public hook URL", () => {
    const m = buildGitHubAppManifest({
      name: "Hostrig",
      publicUrl: "https://apps.example.com",
    })
    expect(m.default_permissions).toMatchObject({
      contents: "read",
      metadata: "read",
      repository_hooks: "write",
    })
    expect(m.default_permissions).not.toHaveProperty("webhooks")
    const callbacks = m.callback_urls as string[]
    expect(callbacks).toContain(
      "https://apps.example.com/api/git/oauth/github/callback",
    )
    expect(callbacks).toContain(
      "http://localhost:9565/api/git/oauth/github/callback",
    )
    expect(m.hook_attributes).toEqual({
      url: "https://apps.example.com/api/webhooks/github-app",
      active: true,
    })
  })

  it("omits app webhook on localhost (GitHub rejects non-public hooks)", () => {
    const m = buildGitHubAppManifest({
      name: "Hostrig",
      publicUrl: "http://localhost:9565",
    })
    expect(m.hook_attributes).toBeUndefined()
    expect(m.default_events).toBeUndefined()
    expect(m.default_permissions).toMatchObject({
      repository_hooks: "write",
    })
    expect(m.callback_urls as string[]).toContain(
      "http://localhost:9565/api/git/oauth/github/callback",
    )
  })

  it("uses browser origin for redirect_url and merges extra callbacks", () => {
    const m = buildGitHubAppManifest({
      name: "Hostrig",
      publicUrl: "http://192.168.0.223:3000",
      extraCallbackOrigins: ["http://localhost:9565"],
    })
    expect(m.redirect_url).toBe(
      "http://192.168.0.223:3000/api/git/github/app-manifest/callback",
    )
    expect(m.setup_url).toBe("http://192.168.0.223:3000/integrations")
    expect(m.callback_urls as string[]).toEqual(
      expect.arrayContaining([
        "http://192.168.0.223:3000/api/git/oauth/github/callback",
        "http://localhost:9565/api/git/oauth/github/callback",
      ]),
    )
    expect(m.hook_attributes).toBeUndefined()
  })
})

describe("redirectBaseFromRequest / sanitizeBrowserOrigin", () => {
  it("prefers public DEPLOW_PUBLIC_URL over private request Host (reverse proxy)", async () => {
    const { redirectBaseFromRequest, sanitizeBrowserOrigin } = await import(
      "./github-app"
    )
    const req = new Request(
      "http://192.168.0.223:3001/api/git/oauth/github/callback?code=x",
    )
    expect(
      redirectBaseFromRequest(req, "https://deplow.waitforit.cc"),
    ).toBe("https://deplow.waitforit.cc")
    expect(sanitizeBrowserOrigin("http://192.168.0.223:3000/")).toBe(
      "http://192.168.0.223:3000",
    )
    expect(sanitizeBrowserOrigin("javascript:alert(1)")).toBeNull()
  })

  it("uses LAN request origin only when configured URL is also local", async () => {
    const { redirectBaseFromRequest } = await import("./github-app")
    const req = new Request(
      "http://192.168.0.223:3000/api/git/github/app-manifest/callback?code=x",
    )
    expect(redirectBaseFromRequest(req, "http://localhost:9565")).toBe(
      "http://192.168.0.223:3000",
    )
  })

  it("honors public X-Forwarded-Host when configured URL is local", async () => {
    const { redirectBaseFromRequest } = await import("./github-app")
    const req = new Request(
      "http://127.0.0.1:9565/api/git/oauth/github/callback?code=x",
      {
        headers: {
          "x-forwarded-host": "deplow.waitforit.cc",
          "x-forwarded-proto": "https",
        },
      },
    )
    expect(redirectBaseFromRequest(req, "http://localhost:9565")).toBe(
      "https://deplow.waitforit.cc",
    )
  })
})

describe("githubOAuthAuthorizeUrl", () => {
  it("points at GitHub authorize with client_id and state, no redirect_uri by default", () => {
    const url = githubOAuthAuthorizeUrl({
      clientId: "cid",
      state: "abc",
    })
    expect(url).toContain("github.com/login/oauth/authorize")
    expect(url).toContain("client_id=cid")
    expect(url).toContain("state=abc")
    expect(url).not.toContain("redirect_uri")
  })

  it("includes redirect_uri only when provided", () => {
    const url = githubOAuthAuthorizeUrl({
      clientId: "cid",
      redirectUri: "https://x/callback",
      state: "abc",
    })
    expect(url).toContain(
      "redirect_uri=" + encodeURIComponent("https://x/callback"),
    )
  })
})

describe("githubAppDeleteSettingsUrl", () => {
  it("points at Advanced settings for the slug", () => {
    expect(githubAppDeleteSettingsUrl("deplow")).toBe(
      "https://github.com/settings/apps/deplow/advanced",
    )
    expect(githubAppDeleteSettingsUrl()).toBe(
      "https://github.com/settings/apps",
    )
  })
})

describe("uninstallAllGitHubAppInstallations", () => {
  it("lists and deletes installations with app JWT", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    })
    const calls: string[] = []
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push(`${init?.method ?? "GET"} ${url}`)
      if (url.includes("/app/installations/") && init?.method === "DELETE") {
        return new Response(null, { status: 202 })
      }
      if (url.startsWith("https://api.github.com/app/installations")) {
        return Response.json([
          { id: 11, account: { login: "alice" } },
          { id: 22, account: { login: "acme" } },
        ])
      }
      return new Response("nope", { status: 404 })
    }
    const result = await uninstallAllGitHubAppInstallations({
      config: {
        appId: "1",
        clientId: "c",
        clientSecret: "s",
        privateKey,
      },
      fetchImpl: fetchImpl as typeof fetch,
    })
    expect(result.uninstalled).toEqual(["alice", "acme"])
    expect(result.errors).toEqual([])
    expect(calls.some((c) => c.startsWith("DELETE "))).toBe(true)
  })
})
