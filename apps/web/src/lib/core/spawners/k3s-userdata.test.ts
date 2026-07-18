import { describe, expect, it } from "vitest"

import {
  buildK3sAgentUserData,
  buildK3sServerUserData,
} from "./k3s-userdata"

describe("k3s userdata", () => {
  it("embeds bootstrap POST for server install and gVisor", () => {
    const script = buildK3sServerUserData({
      controlPlaneUrl: "https://cp.example.com/",
      bootstrapToken: "cb_secret",
      nodeName: "server-1",
    })
    expect(script).toContain("get.k3s.io")
    expect(script).toContain("https://cp.example.com/api/cluster/bootstrap")
    expect(script).toContain("cb_secret")
    expect(script).toContain("--tls-san=")
    expect(script).toContain("--write-kubeconfig-mode 600")
    expect(script).not.toContain("--write-kubeconfig-mode 644")
    expect(script).toContain("server-1")
    expect(script).toContain("install_gvisor_k3s")
    expect(script).toContain("containerd-shim-runsc-v1")
    expect(script).toContain("handler: runsc")
    expect(script).toContain("name: gvisor")
  })

  it("embeds agent join env and gVisor install", () => {
    const script = buildK3sAgentUserData({
      serverUrl: "https://203.0.113.5:6443",
      nodeToken: "K10abc::server:xyz",
      nodeName: "worker-1",
    })
    expect(script).toContain("K3S_URL='https://203.0.113.5:6443'")
    expect(script).toContain("K3S_TOKEN='K10abc::server:xyz'")
    expect(script).toContain("worker-1")
    expect(script).toContain("install_gvisor_k3s")
    expect(script).toContain('runtime_type = "io.containerd.runsc.v1"')
  })
})
