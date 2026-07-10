/**
 * Git webhook signature verification (GitHub + GitLab).
 * Framework-agnostic; used by the HTTP webhook route adapter.
 */

import { createHmac, timingSafeEqual } from "node:crypto"

export type GitProvider = "github" | "gitlab"

/**
 * Verify a GitHub webhook signature header (X-Hub-Signature-256).
 * Header form: `sha256=<hex>`.
 */
export function verifyGitHubSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false
  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex")
  return safeEqualHexPrefixed(signatureHeader, expected)
}

/**
 * Verify a GitLab webhook token (X-Gitlab-Token must equal the secret).
 */
export function verifyGitLabToken(
  tokenHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!tokenHeader || !secret) return false
  return safeEqualStrings(tokenHeader, secret)
}

/**
 * Provider-aware verification. Returns true only when the signature/token matches.
 */
export function verifyWebhookSignature(input: {
  provider: GitProvider
  rawBody: string | Buffer
  secret: string
  /** GitHub: X-Hub-Signature-256 */
  githubSignature?: string | null
  /** GitLab: X-Gitlab-Token */
  gitlabToken?: string | null
}): boolean {
  if (input.provider === "github") {
    return verifyGitHubSignature(
      input.rawBody,
      input.githubSignature,
      input.secret,
    )
  }
  return verifyGitLabToken(input.gitlabToken, input.secret)
}

function safeEqualStrings(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

function safeEqualHexPrefixed(provided: string, expected: string): boolean {
  const a = provided.trim().toLowerCase()
  const b = expected.trim().toLowerCase()
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

/** Extract the branch name from a git ref like `refs/heads/main`. */
export function branchFromRef(ref: string | undefined | null): string | null {
  if (!ref) return null
  const prefix = "refs/heads/"
  if (ref.startsWith(prefix)) return ref.slice(prefix.length)
  return null
}

/**
 * Parse push event branch from GitHub or GitLab webhook JSON body.
 * Returns null if the payload is not a push we understand.
 */
export function extractPushBranch(
  provider: GitProvider,
  payload: unknown,
): string | null {
  if (!payload || typeof payload !== "object") return null
  const obj = payload as Record<string, unknown>
  if (provider === "github") {
    return branchFromRef(typeof obj.ref === "string" ? obj.ref : null)
  }
  // GitLab push events use "ref" the same way
  return branchFromRef(typeof obj.ref === "string" ? obj.ref : null)
}

/** Detect provider from headers when not stored. */
export function detectGitProvider(headers: {
  "x-github-event"?: string | null
  "x-gitlab-event"?: string | null
}): GitProvider | null {
  if (headers["x-github-event"]) return "github"
  if (headers["x-gitlab-event"]) return "gitlab"
  return null
}
