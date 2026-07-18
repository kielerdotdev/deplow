import { describe, expect, it } from "vitest"

import {
  getManagedClusterProvider,
  isManagedSource,
  listManagedClusterProviders,
} from "./registry"

describe("managed cluster provider registry", () => {
  it("registers cloud-init Hetzner only", () => {
    const ids = listManagedClusterProviders().map((p) => p.id)
    expect(ids).toEqual(["hetzner"])
    expect(getManagedClusterProvider("hetzner").label).toMatch(/Hetzner/i)
  })

  it("classifies managed sources", () => {
    expect(isManagedSource("hetzner")).toBe(true)
    expect(isManagedSource("hetzner_k3s")).toBe(false)
    expect(isManagedSource("byo")).toBe(false)
    expect(isManagedSource(null)).toBe(false)
  })

  it("exposes lifecycle capabilities shape", async () => {
    const caps = await getManagedClusterProvider("hetzner").capabilities()
    expect(caps).toMatchObject({
      canCreate: expect.any(Boolean),
      canAddNode: expect.any(Boolean),
      canRemoveNode: expect.any(Boolean),
      canViewKubeconfig: true,
      canDestroy: expect.any(Boolean),
    })
  })
})
