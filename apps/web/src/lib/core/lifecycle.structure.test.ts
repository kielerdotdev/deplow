import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Structural guarantees for G0–G3 lifecycle wiring.
 * Asserts the shipped adapters call real core services (not parallel stubs).
 */
describe("lifecycle structure (create → deploy → proxy → destroy)", () => {
  const root = path.resolve(import.meta.dirname, "../..")

  it("project create pins nodeId and wires services/destroy", () => {
    const src = readFileSync(path.join(root, "orpc/projects.ts"), "utf8")
    expect(src).toContain("ensureLocalNodeId")
    expect(src).toContain("nodeId")
    expect(src).toContain("assertProductionSlug")
    expect(src).toContain("proxyService.removeServiceRoute")
    expect(src).toContain("resourceLinks")
    expect(src).toContain("services")
    expect(src).toContain("removeProjectContainers")

    const servicesWiring = readFileSync(path.join(root, "lib/services.ts"), "utf8")
    expect(servicesWiring).toContain("enqueueProvision")
    expect(servicesWiring).toContain("resourceLinkService.provision")
  })

  it("deploy injects docker-network env, hardens runtime, updates proxy", () => {
    const src = readFileSync(
      path.join(root, "lib/core/queue/deploy-processor.ts"),
      "utf8",
    )
    expect(src).toContain("injectDeployEnv")
    expect(src).toContain("dockerNodeExecutor.deployApp")
    expect(src).toContain("proxyService.upsertServiceRoute")
    expect(src).toContain('status: "building"')
    expect(src).toContain('status: "deploying"')
    expect(src).toContain('status: "running"')

    const orpc = readFileSync(path.join(root, "orpc/deployments.ts"), "utf8")
    expect(orpc).toContain("runProductionDeploy")
    expect(orpc).toContain("runServiceDeploy")
    expect(orpc).toContain("enqueueDeploy")
    expect(orpc).toContain('status: "queued"')
  })

  it("webhook route drives handleGitWebhook (signature + deploy entry)", () => {
    const src = readFileSync(
      path.join(root, "routes/api/webhooks/git.$serviceId.ts"),
      "utf8",
    )
    expect(src).toContain("handleGitWebhook")
    expect(src).toContain("runServiceDeployFromGit")
    expect(src).toContain("runServiceDeploy")
    expect(src).toContain("git_webhook")
    expect(src).toContain("services")
  })

  it("proxyService is wired with caddy reload onChange", () => {
    const src = readFileSync(path.join(root, "lib/services.ts"), "utf8")
    expect(src).toContain("createCaddyReloadOnChange")
    expect(src).toContain("onChange")
    expect(src).toContain("deplow-caddy")
  })

  it("createAndDeploy and connectGit register remote webhooks", () => {
    const src = readFileSync(path.join(root, "orpc/services.ts"), "utf8")
    expect(src).toContain("registerServiceWebhook")
    expect(src).toContain("deleteServiceWebhook")
  })

  it("platform.proxyStatus exposes ingress health for operators", () => {
    const router = readFileSync(path.join(root, "orpc/router.ts"), "utf8")
    const platform = readFileSync(path.join(root, "orpc/platform.ts"), "utf8")
    expect(router).toContain("proxyStatus")
    expect(router).toContain("ingressUpdate")
    expect(router).toContain("operatorWebhookUpdate")
    expect(platform).toContain("getProxyIngressStatus")
    expect(platform).toContain("saveIngressSettings")
    expect(platform).toContain("rebuildAutoHostnames")
    expect(platform).toContain("saveOperatorWebhookSettings")
  })

  it("operations markSucceeded/Failed fire operator webhook", () => {
    const src = readFileSync(
      path.join(root, "lib/core/queue/operations.ts"),
      "utf8",
    )
    expect(src).toContain("notifyOperatorWebhook")
  })

  it("deployments.stop removes proxy route", () => {
    const src = readFileSync(path.join(root, "orpc/deployments.ts"), "utf8")
    expect(src).toContain("stopApp")
    expect(src).toContain("proxyService.removeServiceRoute")
  })

  it("deploy success retains images and rollback uses selectRollbackTarget", () => {
    const processor = readFileSync(
      path.join(root, "lib/core/queue/deploy-processor.ts"),
      "utf8",
    )
    expect(processor).toContain("retainAndPruneDeployImages")
    const orpc = readFileSync(path.join(root, "orpc/deployments.ts"), "utf8")
    expect(orpc).toContain("selectRollbackTarget")
  })

  it("DockerNodeExecutor uses buildUserAppHostConfig for user apps", () => {
    const webReexport = readFileSync(
      path.join(root, "lib/core/docker-node-executor.ts"),
      "utf8",
    )
    expect(webReexport).toContain("@deplow/runtime")
    const src = readFileSync(
      path.join(root, "../../packages/runtime/src/docker-node-executor.ts"),
      "utf8",
    )
    expect(src).toContain("buildUserAppHostConfig")
    expect(src).toContain("assertRuntimeAvailable")
    expect(src).toContain("missingRuntimeError")
    expect(src).not.toMatch(/Privileged:\s*true/)
  })
})

