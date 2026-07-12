/**
 * Git push webhook handler (framework-agnostic).
 * Route adapters call this; unit tests drive it with fixtures + mocks.
 */

import type { GitProvider } from "./webhook-signature"
import {
  extractChangedFiles,
  extractPushBranch,
  shouldDeployForWatchPaths,
  verifyWebhookSignature,
} from "./webhook-signature"

export interface GitWebhookService {
  id: string
  projectId: string
  name: string
  slug: string
  nodeId: string | null
  ownerId?: string | null
  gitProvider: string | null
  gitRepoUrl: string | null
  gitBranch: string | null
  gitWebhookSecretEncrypted: string | null
  /** JSON array of micromatch globs; null/empty = any path */
  gitWatchPaths: string[] | null
}

export interface GitWebhookHandlerDeps {
  loadService: (serviceId: string) => Promise<GitWebhookService | null>
  decryptSecret: (encrypted: string) => string
  /** Record delivery status on the service row */
  recordDelivery: (input: {
    serviceId: string
    status: "rejected" | "ignored" | "accepted" | "success" | "failed"
    error?: string | null
  }) => Promise<void>
  /** Production deploy pipeline entry (clone → build → deploy → proxy) */
  runServiceDeployFromGit: (input: {
    service: GitWebhookService
    branch: string
  }) => Promise<{ deploymentId: string; status: string }>
}

export interface GitWebhookResult {
  status: number
  body: Record<string, unknown>
}

/**
 * Handle a raw git webhook POST for a service.
 * Signature verification happens before any deploy work.
 */
export async function handleGitWebhook(
  input: {
    serviceId: string
    rawBody: string
    headers: {
      "x-hub-signature-256"?: string | null
      "x-gitlab-token"?: string | null
    }
  },
  deps: GitWebhookHandlerDeps,
): Promise<GitWebhookResult> {
  const service = await deps.loadService(input.serviceId)
  if (!service || !service.gitWebhookSecretEncrypted) {
    return {
      status: 404,
      body: { ok: false, error: "Unknown service or git not connected" },
    }
  }

  const secret = deps.decryptSecret(service.gitWebhookSecretEncrypted)
  const provider = (service.gitProvider as GitProvider) || "github"

  const valid = verifyWebhookSignature({
    provider,
    rawBody: input.rawBody,
    secret,
    githubSignature: input.headers["x-hub-signature-256"],
    gitlabToken: input.headers["x-gitlab-token"],
  })

  if (!valid) {
    await deps.recordDelivery({
      serviceId: service.id,
      status: "rejected",
      error: "Invalid webhook signature",
    })
    return { status: 401, body: { ok: false, error: "Invalid signature" } }
  }

  let payload: unknown
  try {
    payload = JSON.parse(input.rawBody)
  } catch {
    return { status: 400, body: { ok: false, error: "Invalid JSON body" } }
  }

  const branch = extractPushBranch(provider, payload)
  const expected = service.gitBranch || "main"

  if (!branch) {
    await deps.recordDelivery({
      serviceId: service.id,
      status: "ignored",
      error: "Not a push event",
    })
    return {
      status: 200,
      body: { ok: true, ignored: true, reason: "not a push" },
    }
  }

  if (branch !== expected) {
    await deps.recordDelivery({
      serviceId: service.id,
      status: "ignored",
      error: `Branch ${branch} ≠ ${expected}`,
    })
    return {
      status: 200,
      body: {
        ok: true,
        ignored: true,
        reason: `branch ${branch} does not match production branch ${expected}`,
      },
    }
  }

  if (!service.gitRepoUrl) {
    return { status: 400, body: { ok: false, error: "No repo URL configured" } }
  }

  const changedFiles = extractChangedFiles(provider, payload)
  if (!shouldDeployForWatchPaths(service.gitWatchPaths, changedFiles)) {
    await deps.recordDelivery({
      serviceId: service.id,
      status: "ignored",
      error: "No changed files match watch paths",
    })
    return {
      status: 200,
      body: {
        ok: true,
        ignored: true,
        reason: "no changed files match watch paths",
      },
    }
  }

  try {
    const result = await deps.runServiceDeployFromGit({
      service,
      branch: expected,
    })
    // Deploy is async — terminal success/failure is recorded by the deploy job.
    await deps.recordDelivery({
      serviceId: service.id,
      status: "accepted",
      error: null,
    })
    return {
      status: 200,
      body: {
        ok: true,
        deploymentId: result.deploymentId,
        status: result.status,
        branch,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await deps.recordDelivery({
      serviceId: service.id,
      status: "failed",
      error: message,
    })
    return { status: 500, body: { ok: false, error: message } }
  }
}

export function gitWebhookResultToResponse(result: GitWebhookResult): Response {
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  })
}

/** @deprecated Use GitWebhookService */
export type GitWebhookProject = GitWebhookService
