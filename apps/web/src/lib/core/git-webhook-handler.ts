/**
 * Git push webhook handler (framework-agnostic).
 * Route adapters call this; unit tests drive it with fixtures + mocks.
 */

import type { GitProvider } from "./webhook-signature"
import { extractPushBranch, verifyWebhookSignature } from "./webhook-signature"

export interface GitWebhookProject {
  id: string
  slug: string
  nodeId: string | null
  ownerId?: string | null
  gitProvider: string | null
  gitRepoUrl: string | null
  gitBranch: string | null
  gitWebhookSecretEncrypted: string | null
  credentialsEncrypted: string | null
  gitAuthMethod?: string | null
  gitInstallationId?: string | null
  gitAccessTokenEncrypted?: string | null
}

export interface GitWebhookHandlerDeps {
  loadProject: (projectId: string) => Promise<GitWebhookProject | null>
  decryptSecret: (encrypted: string) => string
  /** Record delivery status on the project row */
  recordDelivery: (input: {
    projectId: string
    status: "rejected" | "ignored" | "success" | "failed"
    error?: string | null
  }) => Promise<void>
  /** Production deploy pipeline entry (clone → build → deploy → proxy) */
  runProductionDeployFromGit: (input: {
    project: GitWebhookProject
    branch: string
  }) => Promise<{ deploymentId: string; status: string }>
}

export interface GitWebhookResult {
  status: number
  body: Record<string, unknown>
}

/**
 * Handle a raw git webhook POST for a project.
 * Signature verification happens before any deploy work.
 */
export async function handleGitWebhook(
  input: {
    projectId: string
    rawBody: string
    headers: {
      "x-hub-signature-256"?: string | null
      "x-gitlab-token"?: string | null
    }
  },
  deps: GitWebhookHandlerDeps,
): Promise<GitWebhookResult> {
  const project = await deps.loadProject(input.projectId)
  if (!project || !project.gitWebhookSecretEncrypted) {
    return {
      status: 404,
      body: { ok: false, error: "Unknown project or git not connected" },
    }
  }

  const secret = deps.decryptSecret(project.gitWebhookSecretEncrypted)
  const provider = (project.gitProvider as GitProvider) || "github"

  const valid = verifyWebhookSignature({
    provider,
    rawBody: input.rawBody,
    secret,
    githubSignature: input.headers["x-hub-signature-256"],
    gitlabToken: input.headers["x-gitlab-token"],
  })

  if (!valid) {
    await deps.recordDelivery({
      projectId: project.id,
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
  const expected = project.gitBranch || "main"

  if (!branch) {
    await deps.recordDelivery({
      projectId: project.id,
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
      projectId: project.id,
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

  if (!project.gitRepoUrl) {
    return { status: 400, body: { ok: false, error: "No repo URL configured" } }
  }

  try {
    const result = await deps.runProductionDeployFromGit({
      project,
      branch: expected,
    })
    await deps.recordDelivery({
      projectId: project.id,
      status: "success",
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
      projectId: project.id,
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
