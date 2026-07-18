import { describe, expect, it, vi } from "vitest"

import {
  listRemoteBranches,
  listRemoteRepos,
  normalizeRepoUrl,
} from "./git-remote"

describe("normalizeRepoUrl", () => {
  it("expands owner/repo for github and gitlab", () => {
    expect(normalizeRepoUrl("github", "acme/api")).toBe(
      "https://github.com/acme/api.git",
    )
    expect(normalizeRepoUrl("gitlab", "acme/api")).toBe(
      "https://gitlab.com/acme/api.git",
    )
  })

  it("keeps full https urls", () => {
    expect(normalizeRepoUrl("github", "https://github.com/acme/api.git")).toBe(
      "https://github.com/acme/api.git",
    )
  })
})

describe("listRemoteRepos", () => {
  it("maps GitHub /user/repos into RemoteRepo and filters by query", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify([
          {
            id: 1,
            full_name: "acme/api",
            name: "api",
            owner: { login: "acme" },
            description: "HTTP API",
            private: true,
            default_branch: "main",
            clone_url: "https://github.com/acme/api.git",
            html_url: "https://github.com/acme/api",
            updated_at: "2026-01-01T00:00:00Z",
          },
          {
            id: 2,
            full_name: "acme/web",
            name: "web",
            owner: { login: "acme" },
            description: "Frontend",
            private: false,
            default_branch: "master",
            clone_url: "https://github.com/acme/web.git",
            html_url: "https://github.com/acme/web",
            updated_at: "2026-01-02T00:00:00Z",
          },
        ]),
        { status: 200 },
      )
    })

    const all = await listRemoteRepos({
      provider: "github",
      token: "ghp_test",
      fetchImpl,
    })
    expect(all.repos).toHaveLength(2)
    expect(all.repos[0]?.fullName).toBe("acme/api")
    expect(all.repos[0]?.private).toBe(true)

    const filtered = await listRemoteRepos({
      provider: "github",
      token: "ghp_test",
      query: "web",
      fetchImpl,
    })
    expect(filtered.repos).toHaveLength(1)
    expect(filtered.repos[0]?.fullName).toBe("acme/web")
    expect(fetchImpl).toHaveBeenCalled()
    const firstUrl = String(fetchImpl.mock.calls[0]?.[0])
    expect(firstUrl).toContain("api.github.com/user/repos")
  })

  it("throws an actionable reconnect error on 401", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify({ message: "Bad credentials" }), {
        status: 401,
      })
    })
    await expect(
      listRemoteRepos({
        provider: "github",
        token: "bad",
        fetchImpl,
      }),
    ).rejects.toThrow(/Reconnect GitHub|credentials|PAT/i)
  })
})

describe("listRemoteBranches", () => {
  it("returns branch names from GitHub", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify([{ name: "main" }, { name: "develop" }]),
        { status: 200 },
      )
    })
    const branches = await listRemoteBranches({
      provider: "github",
      token: "ghp_test",
      fullName: "acme/api",
      fetchImpl,
    })
    expect(branches).toEqual(["main", "develop"])
  })
})
