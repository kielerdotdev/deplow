import { describe, expect, it } from "vitest"

import { isExpectedDeployFailure, summarizeDeployError } from "./user-error"

describe("summarizeDeployError", () => {
  it("maps gVisor missing to install guidance", () => {
    const msg = summarizeDeployError(
      'gVisor runtime "runsc" is not installed. Install runsc...',
    )
    expect(msg).toMatch(/gVisor/i)
    expect(msg).toMatch(/runsc/i)
    expect(
      isExpectedDeployFailure('gVisor runtime "runsc" is not installed'),
    ).toBe(true)
  })

  it("maps concurrent deploy lock errors", () => {
    const msg = summarizeDeployError(
      "Another deploy is running for this project. Wait for it to finish, then retry.",
    )
    expect(msg.toLowerCase()).toContain("already running")
  })

  it("maps build failures without dumping full logs", () => {
    const msg = summarizeDeployError(
      "docker build failed:\n#1 ERROR huge stack\n#2 more",
    )
    expect(msg.toLowerCase()).toContain("build failed")
    expect(msg.length).toBeLessThan(200)
  })

  it("truncates unknown long messages", () => {
    const raw = "x".repeat(400)
    const msg = summarizeDeployError(raw)
    expect(msg.length).toBeLessThanOrEqual(220)
    expect(msg.endsWith("…")).toBe(true)
  })

  it("handles empty input", () => {
    expect(summarizeDeployError("")).toMatch(/something went wrong/i)
  })
})
