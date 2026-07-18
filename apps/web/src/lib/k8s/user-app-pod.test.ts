import { describe, expect, it } from "vitest"

import {
  buildUserAppPodHardening,
  isGvisorRuntime,
  resolveRuntimeClassName,
  USER_APP_RUNTIME_CLASS,
} from "./user-app-pod"

describe("resolveRuntimeClassName", () => {
  it("always maps to gvisor RuntimeClass", () => {
    expect(resolveRuntimeClassName("runsc")).toBe("gvisor")
    expect(resolveRuntimeClassName("runsc-kvm")).toBe("gvisor")
    expect(resolveRuntimeClassName("gvisor")).toBe("gvisor")
    expect(resolveRuntimeClassName("")).toBe("gvisor")
    expect(resolveRuntimeClassName(undefined)).toBe("gvisor")
  })

  it("rejects runc escape hatch — still returns gvisor", () => {
    expect(resolveRuntimeClassName("runc")).toBe(USER_APP_RUNTIME_CLASS)
    expect(resolveRuntimeClassName("default")).toBe(USER_APP_RUNTIME_CLASS)
  })
})

describe("buildUserAppPodHardening", () => {
  it("always sets gVisor, drop ALL, RO rootfs, limits, tmp", () => {
    const h = buildUserAppPodHardening({
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
    expect(isGvisorRuntime()).toBe(true)
  })

  it("honors readOnlyRootfs opt-out but never omits gVisor", () => {
    const h = buildUserAppPodHardening({
      appRuntime: "runc",
      memoryBytes: 256 * 1024 * 1024,
      nanoCpus: 500_000_000,
      readOnlyRootfs: false,
    })
    expect(h.runtimeClassName).toBe("gvisor")
    expect(h.containerSecurityContext.readOnlyRootFilesystem).toBe(false)
    expect(h.resources.limits.memory).toBe("256Mi")
    expect(h.resources.limits.cpu).toBe("500m")
  })
})
