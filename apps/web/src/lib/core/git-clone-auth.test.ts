import { describe, expect, it } from "vitest"

import {
  authenticatedCloneUrl,
  defaultGitUsername,
  gitAuthConfigEnv,
  hostFromRepoUrl,
  redactSecrets,
} from "./git-clone-auth"

describe("gitAuthConfigEnv", () => {
  it("sets GIT_CONFIG extraheader without putting token in keys", () => {
    const env = gitAuthConfigEnv({
      token: "ghp_secret_token_value",
      host: "github.com",
    })
    expect(env.GIT_TERMINAL_PROMPT).toBe("0")
    expect(env.GIT_CONFIG_COUNT).toBe("1")
    expect(env.GIT_CONFIG_KEY_0).toContain("github.com")
    expect(env.GIT_CONFIG_VALUE_0).toMatch(/^AUTHORIZATION: basic /)
    expect(env.GIT_CONFIG_KEY_0).not.toContain("ghp_secret")
  })
})

describe("authenticatedCloneUrl", () => {
  it("embeds username and token", () => {
    const url = authenticatedCloneUrl("https://github.com/acme/api.git", {
      token: "tok",
      username: "x-access-token",
    })
    expect(url).toContain("x-access-token")
    expect(url).toContain("tok")
    expect(url).toContain("github.com/acme/api.git")
  })
})

describe("redactSecrets", () => {
  it("removes secrets and auth URLs", () => {
    const raw =
      "fatal: https://x-access-token:ghp_secret@github.com/acme/api.git failed AUTHORIZATION: basic abcdef=="
    const out = redactSecrets(raw, ["ghp_secret"])
    expect(out).not.toContain("ghp_secret")
    expect(out).toContain("***")
    expect(out).not.toMatch(/basic\s+abcdef/i)
  })
})

describe("hostFromRepoUrl / defaultGitUsername", () => {
  it("parses hosts and usernames", () => {
    expect(hostFromRepoUrl("https://github.com/a/b.git")).toBe("github.com")
    expect(hostFromRepoUrl("https://gitlab.com/a/b.git")).toBe("gitlab.com")
    expect(defaultGitUsername("github")).toBe("x-access-token")
    expect(defaultGitUsername("gitlab")).toBe("oauth2")
  })
})
