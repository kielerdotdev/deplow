import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"

import {
  branchFromRef,
  extractPushBranch,
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
