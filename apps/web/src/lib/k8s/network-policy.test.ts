import { describe, expect, it } from "vitest"

import { buildProjectNetworkPolicy } from "./network-policy"

describe("buildProjectNetworkPolicy", () => {
  it("default-denies with same-ns, Traefik ingress, and constrained public egress", () => {
    const p = buildProjectNetworkPolicy("proj-acme")
    expect(p.metadata?.name).toBe("hostrig-project-isolation")
    expect(p.metadata?.namespace).toBe("proj-acme")
    expect(p.spec?.policyTypes).toEqual(["Ingress", "Egress"])
    expect(p.spec?.podSelector).toEqual({})
    expect(p.spec?.ingress?.length).toBeGreaterThanOrEqual(2)

    const httpEgress = p.spec?.egress?.find((e) =>
      e.ports?.some((x) => x.port === 443),
    )
    expect(httpEgress).toBeDefined()
    const block = httpEgress?.to?.[0] as
      | { ipBlock?: { cidr?: string; except?: string[] } }
      | undefined
    expect(block?.ipBlock?.cidr).toBe("0.0.0.0/0")
    expect(block?.ipBlock?.except).toContain("169.254.0.0/16")
    expect(block?.ipBlock?.except).toContain("10.0.0.0/8")
    // Must not allow bare port-only egress (cross-namespace ClusterIP + metadata)
    expect(httpEgress?.to?.some((t) => !("ipBlock" in (t as object)))).toBe(
      false,
    )
  })
})
