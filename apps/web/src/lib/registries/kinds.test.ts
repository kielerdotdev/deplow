import { describe, expect, it } from "vitest"

import {
  normalizeImagePrefix,
  registryPullSecretName,
  resolveRegistryServer,
} from "./kinds"

describe("registry kinds", () => {
  it("normalizes image prefixes", () => {
    expect(normalizeImagePrefix("https://ghcr.io/org/app/")).toBe(
      "ghcr.io/org/app",
    )
  })

  it("requires server for generic", () => {
    expect(() => resolveRegistryServer("generic")).toThrow(/Server is required/)
    expect(resolveRegistryServer("generic", "harbor.example.com/")).toBe(
      "harbor.example.com",
    )
  })

  it("builds dns-safe secret names", () => {
    const name = registryPullSecretName(
      "019f7102-1225-7ba2-b662-8708c1b39a75",
    )
    expect(name).toMatch(/^hostrig-reg-[a-z0-9]+$/)
    expect(name.length).toBeLessThanOrEqual(63)
  })
})
