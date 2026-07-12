import { createHmac } from "node:crypto"
import { describe, expect, it, vi } from "vitest"

import {
  handleGitWebhook,
  type GitWebhookHandlerDeps,
  type GitWebhookService,
} from "./git-webhook-handler"

const secret = "webhook-fixture-secret"
const body = JSON.stringify({
  ref: "refs/heads/main",
  repository: { full_name: "acme/app" },
  commits: [
    {
      added: ["apps/web/src/index.ts"],
      modified: [],
      removed: [],
    },
  ],
})

function sign(raw: string, sec: string): string {
  return "sha256=" + createHmac("sha256", sec).update(raw).digest("hex")
}

function serviceFixture(
  overrides: Partial<GitWebhookService> = {},
): GitWebhookService {
  return {
    id: "svc-1",
    projectId: "proj-1",
    name: "web",
    slug: "web",
    nodeId: "node-1",
    gitProvider: "github",
    gitRepoUrl: "https://github.com/acme/app.git",
    gitBranch: "main",
    gitWebhookSecretEncrypted: "enc:secret",
    gitWatchPaths: null,
    ...overrides,
  }
}

describe("handleGitWebhook (shipped handler path)", () => {
  it("rejects invalid signature with 401 and does not enqueue deploy", async () => {
    const runDeploy =
      vi.fn<GitWebhookHandlerDeps["runServiceDeployFromGit"]>()
    const recordDelivery = vi.fn<GitWebhookHandlerDeps["recordDelivery"]>(
      async () => undefined,
    )
    const deps: GitWebhookHandlerDeps = {
      loadService: async () => serviceFixture(),
      decryptSecret: () => secret,
      recordDelivery,
      runServiceDeployFromGit: runDeploy,
    }

    const result = await handleGitWebhook(
      {
        serviceId: "svc-1",
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
      GitWebhookHandlerDeps["runServiceDeployFromGit"]
    >(async () => ({
      deploymentId: "dep-abc",
      status: "queued",
    }))
    const recordDelivery = vi.fn<GitWebhookHandlerDeps["recordDelivery"]>(
      async () => undefined,
    )
    const deps: GitWebhookHandlerDeps = {
      loadService: async () => serviceFixture(),
      decryptSecret: () => secret,
      recordDelivery,
      runServiceDeployFromGit: runDeploy,
    }

    const result = await handleGitWebhook(
      {
        serviceId: "svc-1",
        rawBody: body,
        headers: { "x-hub-signature-256": sign(body, secret) },
      },
      deps,
    )

    expect(result.status).toBe(200)
    expect(result.body.ok).toBe(true)
    expect(result.body.deploymentId).toBe("dep-abc")
    expect(result.body.status).toBe("queued")
    expect(result.body.branch).toBe("main")
    expect(runDeploy).toHaveBeenCalledTimes(1)
    expect(runDeploy).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "main",
        service: expect.objectContaining({ id: "svc-1", slug: "web" }),
      }),
    )
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ status: "accepted" }),
    )
  })

  it("ignores non-production branch without deploy", async () => {
    const runDeploy =
      vi.fn<GitWebhookHandlerDeps["runServiceDeployFromGit"]>()
    const deps: GitWebhookHandlerDeps = {
      loadService: async () => serviceFixture(),
      decryptSecret: () => secret,
      recordDelivery: async () => undefined,
      runServiceDeployFromGit: runDeploy,
    }
    const other = JSON.stringify({ ref: "refs/heads/feature-x" })
    const result = await handleGitWebhook(
      {
        serviceId: "svc-1",
        rawBody: other,
        headers: { "x-hub-signature-256": sign(other, secret) },
      },
      deps,
    )
    expect(result.status).toBe(200)
    expect(result.body.ignored).toBe(true)
    expect(runDeploy).not.toHaveBeenCalled()
  })

  it("ignores pushes that miss watch paths", async () => {
    const runDeploy =
      vi.fn<GitWebhookHandlerDeps["runServiceDeployFromGit"]>()
    const recordDelivery = vi.fn<GitWebhookHandlerDeps["recordDelivery"]>(
      async () => undefined,
    )
    const deps: GitWebhookHandlerDeps = {
      loadService: async () =>
        serviceFixture({ gitWatchPaths: ["packages/**"] }),
      decryptSecret: () => secret,
      recordDelivery,
      runServiceDeployFromGit: runDeploy,
    }
    const result = await handleGitWebhook(
      {
        serviceId: "svc-1",
        rawBody: body,
        headers: { "x-hub-signature-256": sign(body, secret) },
      },
      deps,
    )
    expect(result.status).toBe(200)
    expect(result.body.ignored).toBe(true)
    expect(runDeploy).not.toHaveBeenCalled()
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ignored" }),
    )
  })

  it("deploys when a changed file matches watch paths", async () => {
    const runDeploy = vi.fn<
      GitWebhookHandlerDeps["runServiceDeployFromGit"]
    >(async () => ({ deploymentId: "dep-2", status: "queued" }))
    const deps: GitWebhookHandlerDeps = {
      loadService: async () =>
        serviceFixture({ gitWatchPaths: ["apps/web/**"] }),
      decryptSecret: () => secret,
      recordDelivery: async () => undefined,
      runServiceDeployFromGit: runDeploy,
    }
    const result = await handleGitWebhook(
      {
        serviceId: "svc-1",
        rawBody: body,
        headers: { "x-hub-signature-256": sign(body, secret) },
      },
      deps,
    )
    expect(result.status).toBe(200)
    expect(result.body.ok).toBe(true)
    expect(runDeploy).toHaveBeenCalledTimes(1)
  })
})
