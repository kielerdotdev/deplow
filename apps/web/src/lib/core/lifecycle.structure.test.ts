import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Structural guarantees for G0–G3 lifecycle wiring.
 * Asserts the shipped adapters call real core services (not parallel stubs).
 */
describe("lifecycle structure (create → deploy → proxy → destroy)", () => {
  const root = path.resolve(import.meta.dirname, "../..")

  it("project create requires k3s cluster and wires services/destroy", () => {
    const src = readFileSync(path.join(root, "orpc/projects.ts"), "utf8")
    expect(src).toContain("requireConnectedKubeconfig")
    expect(src).toContain("ensureClusterPlacementNode")
    expect(src).toContain("nodeId")
    expect(src).toContain("assertProductionSlug")
    expect(src).toContain("runProjectDestroy")
    expect(src).toContain("resourceLinks")
    expect(src).toContain("services")

    const destroyPipeline = readFileSync(
      path.join(root, "lib/project-destroy.ts"),
      "utf8",
    )
    expect(destroyPipeline).toContain("serviceLifecycle")
    expect(destroyPipeline).toContain(".destroy(")
    expect(destroyPipeline).toContain("ownerId")
    expect(destroyPipeline).toContain("failures")
    expect(destroyPipeline).not.toContain("AgentJobCleanupPhase")

    const servicesWiring = readFileSync(path.join(root, "lib/services.ts"), "utf8")
    expect(servicesWiring).toContain("enqueueProvision")
    const provision = readFileSync(
      path.join(root, "lib/core/queue/provision-processor.ts"),
      "utf8",
    )
    expect(provision).toMatch(/workloadRegistry/)
    expect(provision).toContain("@/lib/k8s/workload")
  })

  it("deploy dispatches to k8s via ServiceLifecycle", () => {
    const orpc = readFileSync(path.join(root, "orpc/deployments.ts"), "utf8")
    expect(orpc).toContain("runProductionDeploy")
    expect(orpc).toContain("runServiceDeploy")
    expect(orpc).toContain("deployService")
    expect(orpc).not.toContain("runK8sDeploy")

    const lifecycleDeploy = readFileSync(
      path.join(root, "lib/service-lifecycle/deploy.ts"),
      "utf8",
    )
    expect(lifecycleDeploy).toContain("runK8sDeploy")
    expect(lifecycleDeploy).toContain("requireConnectedKubeconfig")
    expect(lifecycleDeploy).toContain("buildServiceDeployEnv")

    const k8s = readFileSync(path.join(root, "lib/k8s/deploy.ts"), "utf8")
    expect(k8s).toContain("deployWebService")
    expect(k8s).toContain("Ingress")
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
    expect(src).toContain("hostrig-caddy")
  })

  it("createAndDeploy and connectGit register remote webhooks via lifecycle", () => {
    const src = readFileSync(path.join(root, "orpc/services.ts"), "utf8")
    expect(src).toContain("serviceLifecycle")
    expect(src).toContain("connectGit")
    const git = readFileSync(
      path.join(root, "lib/service-lifecycle/git.ts"),
      "utf8",
    )
    expect(git).toContain("registerServiceWebhook")
    expect(git).toContain("deleteServiceWebhook")
  })

  it("service and project destroy go through lifecycle orchestrators", () => {
    const servicesSrc = readFileSync(path.join(root, "orpc/services.ts"), "utf8")
    expect(servicesSrc).toContain("serviceLifecycle.destroy")
    expect(servicesSrc).not.toContain("unsyncNetbirdForService")
    const projectsSrc = readFileSync(path.join(root, "orpc/projects.ts"), "utf8")
    expect(projectsSrc).toContain("runProjectDestroy")
    expect(projectsSrc).not.toContain("unsyncNetbirdForService")
    const destroy = readFileSync(
      path.join(root, "lib/service-lifecycle/destroy.ts"),
      "utf8",
    )
    expect(destroy).toContain("deleteServiceWebhook")
    expect(destroy).toContain("destroyWorkload")
    const surface = readFileSync(
      path.join(root, "lib/k8s/surface.ts"),
      "utf8",
    )
    expect(surface).toContain("unpublishServiceSurface")
    expect(surface).toContain("workloadRegistry")
    expect(surface).toContain("destroyWorkload")
    const deploy = readFileSync(path.join(root, "lib/k8s/run-deploy.ts"), "utf8")
    expect(deploy).toContain("runDeployPublishHooks")
    expect(deploy).not.toContain("syncNetbirdService")
    const edgeOrpc = readFileSync(path.join(root, "orpc/edge.ts"), "utf8")
    expect(edgeOrpc).toContain('edgeRegistry().get("netbird")')
  })

  it("platform.proxyStatus exposes ingress health for operators", () => {
    const router = readFileSync(path.join(root, "orpc/router.ts"), "utf8")
    const platform = readFileSync(path.join(root, "orpc/platform.ts"), "utf8")
    expect(router).toContain("proxyStatus")
    expect(router).toContain("ingressUpdate")
    expect(router).not.toContain("operatorWebhookUpdate")
    expect(router).toContain("netbirdConnect")
    expect(router).toContain("edge:")
    expect(platform).toContain("getProxyIngressStatus")
    expect(platform).toContain("saveIngressSettings")
    expect(platform).toContain("rebuildAutoHostnames")
    expect(platform).not.toContain("saveOperatorWebhookSettings")
  })

  it("deployments.stop goes through serviceLifecycle.stop", () => {
    const src = readFileSync(path.join(root, "orpc/deployments.ts"), "utf8")
    expect(src).toContain("stopService")
    expect(src).not.toContain("scaleWebService")
    const stop = readFileSync(
      path.join(root, "lib/service-lifecycle/stop.ts"),
      "utf8",
    )
    expect(stop).toContain("driver.stop")
    expect(stop).toContain("unpublishServiceSurface")
  })

  it("deploy success marks prior deployments stopped; rollback uses selectRollbackTarget", () => {
    const runDeploy = readFileSync(
      path.join(root, "lib/k8s/run-deploy.ts"),
      "utf8",
    )
    expect(runDeploy).toContain("markPriorDeploymentsStopped")
    const orpc = readFileSync(path.join(root, "orpc/deployments.ts"), "utf8")
    expect(orpc).toContain("selectRollbackTarget")
    const queue = readFileSync(path.join(root, "lib/core/queue/index.ts"), "utf8")
    expect(queue).not.toContain("enqueueDeploy")
    expect(queue).not.toContain("hostrig-deploy")
  })
})

