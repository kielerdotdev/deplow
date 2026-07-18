import { describe, expect, it } from "vitest"

import { buildProjectNetworkPolicy } from "./network-policy"

describe("buildProjectNetworkPolicy", () => {
  it("default-denies with same-ns, kube-system ingress, and limited egress", () => {
    const p = buildProjectNetworkPolicy("proj-acme")
    expect(p.metadata?.name).toBe("hostrig-project-isolation")
    expect(p.metadata?.namespace).toBe("proj-acme")
    expect(p.spec?.policyTypes).toEqual(["Ingress", "Egress"])
    expect(p.spec?.podSelector).toEqual({})
    expect(p.spec?.ingress?.length).toBeGreaterThanOrEqual(2)
    expect(p.spec?.egress?.some((e) => e.ports?.some((x) => x.port === 443))).toBe(
      true,
    )
  })
})
