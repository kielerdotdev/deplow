import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === "dist" ||
      name.endsWith(".test.ts")
    ) {
      continue
    }
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walkTsFiles(full, out)
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full)
  }
  return out
}

/**
 * Grep guard: only service-lifecycle/transition.ts may write services.status
 * via drizzle update .set({ status: … }).
 */
describe("service lifecycle single writer", () => {
  const webSrc = path.resolve(import.meta.dirname, "../..")

  it("only transition.ts updates services.status", () => {
    const files = walkTsFiles(webSrc)
    const offenders: string[] = []
    const statusSet =
      /\.update\(\s*services\s*\)[\s\S]{0,200}?\.set\(\s*\{[^}]*\bstatus\s*:/

    for (const file of files) {
      if (file.includes(`${path.sep}service-lifecycle${path.sep}transition.ts`)) {
        continue
      }
      const src = readFileSync(file, "utf8")
      if (statusSet.test(src)) {
        offenders.push(path.relative(webSrc, file))
      }
    }
    expect(offenders).toEqual([])
  })

  it("ORPC services/deployments call serviceLifecycle / deployService / stopService", () => {
    const services = readFileSync(
      path.join(webSrc, "orpc/services.ts"),
      "utf8",
    )
    expect(services).toContain("serviceLifecycle")
    expect(services).toContain("serviceLifecycle.destroy")
    expect(services).not.toMatch(/\.update\(\s*services\s*\)[\s\S]{0,120}status:/)

    const deployments = readFileSync(
      path.join(webSrc, "orpc/deployments.ts"),
      "utf8",
    )
    expect(deployments).toContain("deployService")
    expect(deployments).toContain("stopService")
    expect(deployments).not.toContain("scaleWebService")
    expect(deployments).not.toMatch(/\.update\(\s*services\s*\)[\s\S]{0,120}status:/)
  })

  it("destroy deletes git webhook and creates destroy operation", () => {
    const destroy = readFileSync(
      path.join(import.meta.dirname, "destroy.ts"),
      "utf8",
    )
    expect(destroy).toContain("deleteServiceWebhook")
    expect(destroy).toContain('type: "destroy"')
    expect(destroy).toContain('transitionService(service.id, "destroying"')
  })

  it("k8s deploy uses buildServiceDeployEnv and workload driver", () => {
    const deploy = readFileSync(
      path.join(import.meta.dirname, "deploy.ts"),
      "utf8",
    )
    expect(deploy).toContain("buildServiceDeployEnv")
    expect(deploy).toContain("runK8sDeploy")
    const runDeploy = readFileSync(
      path.join(webSrc, "lib/k8s/run-deploy.ts"),
      "utf8",
    )
    expect(runDeploy).toContain("workloadRegistry")
    expect(runDeploy).toContain("markServiceDeploySucceeded")
    expect(runDeploy).toContain("driver.deploy")
  })

  it("legacy Docker deploy path is removed", () => {
    const queue = readFileSync(
      path.join(webSrc, "lib/core/queue/index.ts"),
      "utf8",
    )
    expect(queue).not.toContain("enqueueDeploy")
    expect(queue).not.toContain("DeployJobData")
    expect(queue).not.toContain("HOSTRIG_LEGACY_DOCKER_DEPLOY")
  })
})
