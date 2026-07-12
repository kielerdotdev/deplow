import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"

import {
  branchFromRef,
  extractChangedFiles,
  extractPushBranch,
  shouldDeployForWatchPaths,
  verifyGitHubSignature,
  verifyGitLabToken,
  verifyWebhookSignature,
} from "./webhook-signature"

const body = JSON.stringify({
  ref: "refs/heads/main",
  repository: { full_name: "acme/app" },
})
const secret = "super-secret-webhook-token"

describe("verifyGitHubSignature", () => {
  it("accepts a valid sha256 signature", () => {
    const sig =
      "sha256=" + createHmac("sha256", secret).update(body).digest("hex")
    expect(verifyGitHubSignature(body, sig, secret)).toBe(true)
    expect(
      verifyWebhookSignature({
        provider: "github",
        rawBody: body,
        secret,
        githubSignature: sig,
      }),
    ).toBe(true)
  })

  it("rejects invalid or missing signatures without deploying", () => {
    expect(verifyGitHubSignature(body, "sha256=deadbeef", secret)).toBe(false)
    expect(verifyGitHubSignature(body, null, secret)).toBe(false)
    expect(verifyGitHubSignature(body, "sha256=ab", secret)).toBe(false)
    const good =
      "sha256=" + createHmac("sha256", secret).update(body).digest("hex")
    expect(verifyGitHubSignature(body, good, "wrong-secret")).toBe(false)
  })
})

describe("verifyGitLabToken", () => {
  it("accepts matching token and rejects mismatch", () => {
    expect(verifyGitLabToken(secret, secret)).toBe(true)
    expect(verifyGitLabToken("nope", secret)).toBe(false)
    expect(
      verifyWebhookSignature({
        provider: "gitlab",
        rawBody: body,
        secret,
        gitlabToken: secret,
      }),
    ).toBe(true)
    expect(
      verifyWebhookSignature({
        provider: "gitlab",
        rawBody: body,
        secret,
        gitlabToken: "bad",
      }),
    ).toBe(false)
  })
})

describe("extractPushBranch", () => {
  it("parses refs/heads/* for github and gitlab", () => {
    expect(branchFromRef("refs/heads/main")).toBe("main")
    expect(extractPushBranch("github", { ref: "refs/heads/main" })).toBe("main")
    expect(extractPushBranch("gitlab", { ref: "refs/heads/production" })).toBe(
      "production",
    )
    expect(extractPushBranch("github", { ref: "refs/tags/v1" })).toBe(null)
  })
})

describe("extractChangedFiles + shouldDeployForWatchPaths", () => {
  it("collects added/modified/removed paths from commits", () => {
    const files = extractChangedFiles("github", {
      commits: [
        {
          added: ["a.ts"],
          modified: ["b.ts"],
          removed: ["c.ts"],
        },
      ],
      head_commit: { modified: ["d.ts"] },
    })
    expect(files?.sort()).toEqual(["a.ts", "b.ts", "c.ts", "d.ts"])
  })

  it("returns null when commits are absent (deploy-all)", () => {
    expect(extractChangedFiles("github", { ref: "refs/heads/main" })).toBe(null)
    expect(shouldDeployForWatchPaths(["apps/**"], null)).toBe(true)
  })

  it("matches micromatch globs", () => {
    expect(shouldDeployForWatchPaths(null, ["x.ts"])).toBe(true)
    expect(shouldDeployForWatchPaths([], ["x.ts"])).toBe(true)
    expect(shouldDeployForWatchPaths(["apps/**"], ["docs/readme.md"])).toBe(
      false,
    )
    expect(shouldDeployForWatchPaths(["apps/**"], ["apps/web/a.ts"])).toBe(true)
  })
})
