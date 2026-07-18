import { describe, expect, it } from "vitest"

import {
  buildGvisorRuntimeClass,
  GVISOR_HANDLER,
  GVISOR_RUNTIME_CLASS,
  missingRuntimeClassError,
} from "./runtime-class"

describe("buildGvisorRuntimeClass", () => {
  it("defines handler runsc named gvisor", () => {
    const rc = buildGvisorRuntimeClass()
    expect(rc.metadata?.name).toBe(GVISOR_RUNTIME_CLASS)
    expect(rc.handler).toBe(GVISOR_HANDLER)
    expect(rc.kind).toBe("RuntimeClass")
  })
})

describe("missingRuntimeClassError", () => {
  it("points at install script and escape hatch", () => {
    const err = missingRuntimeClassError("gvisor")
    expect(err.message).toContain("install-gvisor-k3s")
    expect(err.message).toContain("DEPLOW_APP_RUNTIME=runc")
  })
})
