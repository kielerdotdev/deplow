import { describe, expect, it } from "vitest"

import {
  canTransitionServiceStatus,
  IllegalServiceTransitionError,
} from "./transition"

describe("service status FSM", () => {
  it("allows documented edges", () => {
    expect(canTransitionServiceStatus("stopped", "deploying")).toBe(true)
    expect(canTransitionServiceStatus("deploying", "running")).toBe(true)
    expect(canTransitionServiceStatus("running", "stopped")).toBe(true)
    expect(canTransitionServiceStatus("running", "destroying")).toBe(true)
    expect(canTransitionServiceStatus("error", "deploying")).toBe(true)
    expect(canTransitionServiceStatus("queued", "provisioning")).toBe(true)
    expect(canTransitionServiceStatus("provisioning", "running")).toBe(true)
  })

  it("allows same-status no-op", () => {
    expect(canTransitionServiceStatus("running", "running")).toBe(true)
  })

  it("rejects illegal edges", () => {
    expect(canTransitionServiceStatus("destroying", "running")).toBe(false)
    expect(canTransitionServiceStatus("running", "queued")).toBe(false)
    expect(canTransitionServiceStatus("provisioning", "deploying")).toBe(false)
  })

  it("allows destroying → error so failed teardown is recoverable", () => {
    expect(canTransitionServiceStatus("destroying", "error")).toBe(true)
  })

  it("IllegalServiceTransitionError names the edge", () => {
    const err = new IllegalServiceTransitionError("running", "queued")
    expect(err.message).toContain("running → queued")
  })
})
