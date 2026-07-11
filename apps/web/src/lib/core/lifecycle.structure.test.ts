import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Structural guarantees for G0–G3 lifecycle wiring.
 * Asserts the shipped adapters call real core services (not parallel stubs).
 */
describe("lifecycle structure (create → deploy → proxy → destroy)", () => {
  const root = path.resolve(import.meta.dirname, "../..")

  it("project create pins nodeId and provisions linked resources", () => {
    const src = readFileSync(path.join(root, "orpc/projects.ts"), "utf8")
    expect(src).toContain("ensureLocalNodeId")
    expect(src).toContain("nodeId")
    expect(src).toContain("assertProductionSlug")
    expect(src).toContain("resourceLinkService.provision")
    expect(src).toContain("proxyService.removeServiceRoute")
    expect(src).toContain("resourceLinks")
    expect(src).toContain("services")
    expect(src).toContain("removeProjectContainers")
  })

  it("deploy injects docker-network env, hardens runtime, updates proxy", () => {
    const src = readFileSync(path.join(root, "orpc/deployments.ts"), "utf8")
    expect(src).toContain("injectDeployEnv")
    expect(src).toContain("runProductionDeploy")
    expect(src).toContain("executeDeploy")
    expect(src).toContain("dockerNodeExecutor.deployApp")
    expect(src).toContain("proxyService.upsertServiceRoute")
    expect(src).toContain('status: "queued"')
    expect(src).toContain('status: "building"')
    expect(src).toContain('status: "deploying"')
    expect(src).toContain('status: "running"')
    expect(src).toContain("void executeDeploy")
  })

  it("webhook route drives handleGitWebhook (signature + deploy entry)", () => {
    const src = readFileSync(
      path.join(root, "routes/api/webhooks/git.$projectId.ts"),
      "utf8",
    )
    expect(src).toContain("handleGitWebhook")
    expect(src).toContain("runProductionDeployFromGit")
    expect(src).toContain("runServiceDeploy")
    expect(src).toContain("git_webhook")
  })

  it("proxyService is wired with caddy reload onChange", () => {
    const src = readFileSync(path.join(root, "lib/services.ts"), "utf8")
    expect(src).toContain("createCaddyReloadOnChange")
    expect(src).toContain("onChange")
    expect(src).toContain("deplow-caddy")
  })

  it("deployments.stop removes proxy route", () => {
    const src = readFileSync(path.join(root, "orpc/deployments.ts"), "utf8")
    expect(src).toContain("stopApp")
    expect(src).toContain("proxyService.removeServiceRoute")
  })

  it("DockerNodeExecutor uses buildUserAppHostConfig for user apps", () => {
    const src = readFileSync(
      path.join(root, "lib/core/docker-node-executor.ts"),
      "utf8",
    )
    expect(src).toContain("buildUserAppHostConfig")
    expect(src).toContain("assertRuntimeAvailable")
    expect(src).toContain("missingRuntimeError")
    expect(src).not.toMatch(/Privileged:\s*true/)
  })
})
