import { createHmac } from "node:crypto"
import { describe, expect, it, vi } from "vitest"

import {
  handleGitWebhook,
  type GitWebhookHandlerDeps,
  type GitWebhookProject,
} from "./git-webhook-handler"

const secret = "webhook-fixture-secret"
const body = JSON.stringify({
  ref: "refs/heads/main",
  repository: { full_name: "acme/app" },
})

function sign(raw: string, sec: string): string {
  return "sha256=" + createHmac("sha256", sec).update(raw).digest("hex")
}

function projectFixture(
  overrides: Partial<GitWebhookProject> = {},
): GitWebhookProject {
  return {
    id: "proj-1",
    slug: "demo",
    nodeId: "node-1",
    gitProvider: "github",
    gitRepoUrl: "https://github.com/acme/app.git",
    gitBranch: "main",
    gitWebhookSecretEncrypted: "enc:secret",
    credentialsEncrypted: "enc:creds",
    ...overrides,
  }
}

describe("handleGitWebhook (shipped handler path)", () => {
  it("rejects invalid signature with 401 and does not enqueue deploy", async () => {
    const runDeploy =
      vi.fn<GitWebhookHandlerDeps["runProductionDeployFromGit"]>()
    const recordDelivery = vi.fn<GitWebhookHandlerDeps["recordDelivery"]>(
      async () => undefined,
    )
    const deps: GitWebhookHandlerDeps = {
      loadProject: async () => projectFixture(),
      decryptSecret: () => secret,
      recordDelivery,
      runProductionDeployFromGit: runDeploy,
    }

    const result = await handleGitWebhook(
      {
        projectId: "proj-1",
        rawBody: body,
        headers: { "x-hub-signature-256": "sha256=deadbeef" },
      },
      deps,
    )

    expect(result.status).toBe(401)
    expect(result.body.ok).toBe(false)
    expect(result.body.error).toMatch(/signature/i)
    expect(runDeploy).not.toHaveBeenCalled()
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected" }),
    )
  })

  it("accepts valid GitHub signature and enqueues production deploy entry", async () => {
    const runDeploy = vi.fn<
      GitWebhookHandlerDeps["runProductionDeployFromGit"]
    >(async () => ({
      deploymentId: "dep-abc",
      status: "running",
    }))
    const recordDelivery = vi.fn<GitWebhookHandlerDeps["recordDelivery"]>(
      async () => undefined,
    )
    const deps: GitWebhookHandlerDeps = {
      loadProject: async () => projectFixture(),
      decryptSecret: () => secret,
      recordDelivery,
      runProductionDeployFromGit: runDeploy,
    }

    const result = await handleGitWebhook(
      {
        projectId: "proj-1",
        rawBody: body,
        headers: { "x-hub-signature-256": sign(body, secret) },
      },
      deps,
    )

    expect(result.status).toBe(200)
    expect(result.body.ok).toBe(true)
    expect(result.body.deploymentId).toBe("dep-abc")
    expect(result.body.status).toBe("running")
    expect(result.body.branch).toBe("main")
    expect(runDeploy).toHaveBeenCalledTimes(1)
    expect(runDeploy).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "main",
        project: expect.objectContaining({ id: "proj-1", slug: "demo" }),
      }),
    )
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ status: "accepted" }),
    )
  })

  it("ignores non-production branch without deploy", async () => {
    const runDeploy =
      vi.fn<GitWebhookHandlerDeps["runProductionDeployFromGit"]>()
    const deps: GitWebhookHandlerDeps = {
      loadProject: async () => projectFixture(),
      decryptSecret: () => secret,
      recordDelivery: async () => undefined,
      runProductionDeployFromGit: runDeploy,
    }
    const other = JSON.stringify({ ref: "refs/heads/feature-x" })
    const result = await handleGitWebhook(
      {
        projectId: "proj-1",
        rawBody: other,
        headers: { "x-hub-signature-256": sign(other, secret) },
      },
      deps,
    )
    expect(result.status).toBe(200)
    expect(result.body.ignored).toBe(true)
    expect(runDeploy).not.toHaveBeenCalled()
  })
})
