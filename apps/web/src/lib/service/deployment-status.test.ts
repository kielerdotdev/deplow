import { describe, expect, it } from "vitest"

import {
  defaultDeploymentView,
  resolveDeployPrimaryAction,
  resolveServiceDisplayStatus,
  shortSha,
  triggerLabel,
} from "./deployment-status"

describe("deployment-status", () => {
  it("labels triggers", () => {
    expect(triggerLabel("git_webhook")).toBe("Git push")
    expect(triggerLabel("manual")).toBe("Manual")
  })

  it("shortens sha", () => {
    expect(shortSha("ff9eabb1deadbeef")).toBe("ff9eabb")
  })

  it("defaults view for in-progress deploys to build logs", () => {
    expect(defaultDeploymentView("queued")).toBe("build-logs")
    expect(defaultDeploymentView("running")).toBe("summary")
  })

  it("resolves primary deploy action from latest state", () => {
    expect(
      resolveDeployPrimaryAction({
        gitConnected: true,
        latest: { id: "d1", status: "building" },
      }),
    ).toEqual({ kind: "view", label: "View build", deploymentId: "d1" })

    expect(
      resolveDeployPrimaryAction({
        gitConnected: true,
        latest: { id: "d2", status: "failed" },
      }),
    ).toEqual({
      kind: "retry",
      label: "Retry deployment",
      deploymentId: "d2",
    })

    expect(
      resolveDeployPrimaryAction({
        gitConnected: true,
        latest: { id: "d3", status: "running" },
      }),
    ).toEqual({ kind: "deploy", label: "Deploy latest" })
  })

  it("maps never-deployed services to not_deployed", () => {
    expect(
      resolveServiceDisplayStatus({
        serviceStatus: "stopped",
        hasSuccessfulDeploy: false,
      }),
    ).toBe("not_deployed")
    expect(
      resolveServiceDisplayStatus({
        serviceStatus: "running",
        hasSuccessfulDeploy: true,
      }),
    ).toBe("running")
  })
})
