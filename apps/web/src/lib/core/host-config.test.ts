import { describe, expect, it } from "vitest"

import {
  buildUserAppHostConfig,
  missingRuntimeError,
  parseRuntimeLimits,
} from "./host-config"

describe("buildUserAppHostConfig", () => {
  it("applies runsc runtime, caps drop, RO rootfs, limits, and no docker.sock", () => {
    const limits = parseRuntimeLimits({
      appRuntime: "runsc",
      appMemoryMb: 512,
      appCpus: 1,
    })
    const hc = buildUserAppHostConfig({
      runtime: limits,
      networkMode: "deplow_default",
      portBindings: { "80/tcp": [{ HostPort: "8080" }] },
    })

    expect(hc.Runtime).toBe("runsc")
    expect(hc.NetworkMode).toBe("deplow_default")
    expect(hc.CapDrop).toEqual(["ALL"])
    expect(hc.SecurityOpt).toContain("no-new-privileges:true")
    expect(hc.ReadonlyRootfs).toBe(true)
    expect(hc.Tmpfs["/tmp"]).toContain("rw")
    expect(hc.Memory).toBe(512 * 1024 * 1024)
    expect(hc.NanoCpus).toBe(1_000_000_000)
    expect(hc.RestartPolicy.Name).toBe("unless-stopped")
    // Never privileged / host net — asserted by absence of those keys on the object
    expect(hc).not.toHaveProperty("Privileged")
    expect(hc).not.toHaveProperty("Binds")
    expect(JSON.stringify(hc)).not.toContain("docker.sock")
  })

  it("honors readOnlyRootfs opt-out", () => {
    const limits = parseRuntimeLimits({ appRuntime: "runsc" })
    const hc = buildUserAppHostConfig({
      runtime: limits,
      networkMode: "deplow_default",
      readOnlyRootfs: false,
    })
    expect(hc.ReadonlyRootfs).toBe(false)
  })

  it("defaults runtime to runsc when env omitted", () => {
    const limits = parseRuntimeLimits({})
    expect(limits.runtime).toBe("runsc")
    expect(limits.required).toBe(true)
  })
})

describe("missingRuntimeError", () => {
  it("mentions gVisor install steps for runsc", () => {
    const err = missingRuntimeError("runsc")
    expect(err.message).toContain("gVisor")
    expect(err.message).toContain("runsc")
    expect(err.message).toContain("README")
  })
})
