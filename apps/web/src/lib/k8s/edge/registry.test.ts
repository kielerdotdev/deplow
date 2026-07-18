import { describe, expect, it, vi } from "vitest"

import { NoopEdgeProvider } from "./noop-provider"
import { EdgeRegistry, resetEdgeRegistryForTests } from "./registry"
import type { EdgeProvider } from "./types"

describe("EdgeRegistry", () => {
  it("resolves active provider by ingress edgeMode", () => {
    const registry = new EdgeRegistry()
    expect(registry.active({ edgeMode: "netbird" }).mode).toBe("netbird")
    expect(registry.active({ edgeMode: "local" }).mode).toBe("local")
    expect(registry.active({ edgeMode: "cloudflare" }).mode).toBe("cloudflare")
    expect(registry.active({ edgeMode: "tailscale" }).mode).toBe("tailscale")
  })

  it("noop publish and unpublish are safe", async () => {
    const noop = new NoopEdgeProvider("cloudflare")
    await expect(
      noop.publish({
        serviceId: "svc",
        hostname: "app.example.com",
        kubeconfigYaml: "",
      }),
    ).resolves.toEqual({ created: false, note: "" })
    await expect(noop.unpublish({ serviceId: "svc" })).resolves.toBeUndefined()
    expect(
      noop.resolvePublicHost({
        slug: "app",
        baseDomain: "example.com",
        publicProtocol: "https",
      }),
    ).toEqual({
      hostname: "app.example.com",
      publicUrl: "https://app.example.com",
    })
  })

  it("delegates publish/unpublish to registered provider", async () => {
    const publish = vi.fn(async () => ({ created: true, note: "ok" }))
    const unpublish = vi.fn(async () => undefined)
    const fake: EdgeProvider = {
      mode: "netbird",
      status: async () => ({ mode: "netbird", ready: true, message: null }),
      publish,
      unpublish,
      resolvePublicHost: (input) => ({
        hostname: `${input.slug}.${input.baseDomain}`,
        publicUrl: `https://${input.slug}.${input.baseDomain}`,
      }),
    }
    const registry = new EdgeRegistry([
      fake,
      new NoopEdgeProvider("local"),
      new NoopEdgeProvider("cloudflare"),
      new NoopEdgeProvider("tailscale"),
    ])
    const active = registry.active({ edgeMode: "netbird" })
    await active.publish({
      serviceId: "s1",
      hostname: "a.example.com",
      kubeconfigYaml: "kc",
    })
    await active.unpublish({ serviceId: "s1" })
    expect(publish).toHaveBeenCalledOnce()
    expect(unpublish).toHaveBeenCalledWith({ serviceId: "s1" })
  })

  it("resetEdgeRegistryForTests clears singleton", () => {
    resetEdgeRegistryForTests()
    expect(() => resetEdgeRegistryForTests()).not.toThrow()
  })
})
