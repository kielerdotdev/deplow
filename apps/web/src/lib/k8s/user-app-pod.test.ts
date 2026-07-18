import { describe, expect, it } from "vitest"

import {
  buildUserAppPodHardening,
  isGvisorRuntime,
  resolveRuntimeClassName,
} from "./user-app-pod"

describe("resolveRuntimeClassName", () => {
  it("maps runsc/gvisor to gvisor RuntimeClass", () => {
    expect(resolveRuntimeClassName("runsc")).toBe("gvisor")
    expect(resolveRuntimeClassName("runsc-kvm")).toBe("gvisor")
    expect(resolveRuntimeClassName("gvisor")).toBe("gvisor")
  })

  it("omits RuntimeClass for runc escape hatch", () => {
    expect(resolveRuntimeClassName("runc")).toBeUndefined()
    expect(resolveRuntimeClassName("")).toBeUndefined()
  })

  it("passes through future/custom class names", () => {
    expect(resolveRuntimeClassName("kata")).toBe("kata")
  })
})

describe("buildUserAppPodHardening", () => {
  it("mirrors Docker host-config intent: gVisor, drop ALL, RO rootfs, limits, tmp", () => {
    const h = buildUserAppPodHardening({
      appRuntime: "runsc",
      memoryBytes: 512 * 1024 * 1024,
      nanoCpus: 1e9,
    })

    expect(h.runtimeClassName).toBe("gvisor")
    expect(h.podSecurityContext.runAsNonRoot).toBe(true)
    expect(h.podSecurityContext.seccompProfile.type).toBe("RuntimeDefault")
    expect(h.containerSecurityContext.capabilities.drop).toEqual(["ALL"])
    expect(h.containerSecurityContext.allowPrivilegeEscalation).toBe(false)
    expect(h.containerSecurityContext.readOnlyRootFilesystem).toBe(true)
    expect(h.resources.limits.memory).toBe("512Mi")
    expect(h.resources.limits.cpu).toBe("1")
    expect(h.volumeMounts).toEqual([{ name: "tmp", mountPath: "/tmp" }])
    expect(isGvisorRuntime("runsc")).toBe(true)
  })

  it("honors readOnlyRootfs opt-out and omits runtime for runc", () => {
    const h = buildUserAppPodHardening({
      appRuntime: "runc",
      memoryBytes: 256 * 1024 * 1024,
      nanoCpus: 500_000_000,
      readOnlyRootfs: false,
    })
    expect(h.runtimeClassName).toBeUndefined()
    expect(h.containerSecurityContext.readOnlyRootFilesystem).toBe(false)
    expect(h.resources.limits.memory).toBe("256Mi")
    expect(h.resources.limits.cpu).toBe("500m")
  })
})
