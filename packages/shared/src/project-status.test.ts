import { describe, expect, it } from "vitest"

import { deriveProjectStatus } from "./project-status"

describe("deriveProjectStatus", () => {
  it("keeps lifecycle statuses from storage", () => {
    expect(deriveProjectStatus("destroying", ["running"])).toBe("destroying")
    expect(deriveProjectStatus("provisioning", ["error"])).toBe("provisioning")
  })

  it("returns ready for an empty project", () => {
    expect(deriveProjectStatus("ready", [])).toBe("ready")
  })

  it("returns ready when all services are running", () => {
    expect(deriveProjectStatus("ready", ["running", "running"])).toBe("ready")
  })

  it("returns error when every service failed", () => {
    expect(deriveProjectStatus("ready", ["error", "error", "error"])).toBe(
      "error",
    )
  })

  it("returns degraded when some services run and some failed", () => {
    expect(deriveProjectStatus("ready", ["running", "error"])).toBe("degraded")
  })

  it("returns degraded for a mix of failed and stopped services", () => {
    expect(deriveProjectStatus("ready", ["error", "stopped"])).toBe("degraded")
  })

  it("returns stopped when all services are stopped", () => {
    expect(deriveProjectStatus("ready", ["stopped", "stopped"])).toBe("stopped")
  })

  it("returns ready when running services coexist with stopped ones", () => {
    expect(deriveProjectStatus("ready", ["running", "stopped"])).toBe("ready")
  })

  it("returns provisioning while any service is deploying", () => {
    expect(deriveProjectStatus("ready", ["running", "deploying"])).toBe(
      "provisioning",
    )
    expect(deriveProjectStatus("ready", ["queued"])).toBe("provisioning")
  })

  it("treats legacy service ready status as stopped", () => {
    expect(deriveProjectStatus("ready", ["ready", "ready"])).toBe("stopped")
  })
})
