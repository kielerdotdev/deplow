import { afterEach, describe, expect, it } from "vitest"

import {
  registryImageRef,
  sanitizeImageNamePart,
} from "./build"
import { registryPullSecretName } from "@/lib/registries/kinds"

describe("build registry helpers", () => {
  it("sanitizes image name parts", () => {
    expect(sanitizeImageNamePart("My Project!")).toBe("my-project")
    expect(sanitizeImageNamePart("---")).toBe("app")
  })

  it("builds a registry image ref", () => {
    expect(
      registryImageRef({
        registry: "ghcr.io/acme/hostrig/",
        projectSlug: "portfolio",
        serviceName: "web",
        deploymentId: "abcdef12-3456-7890",
      }),
    ).toBe("ghcr.io/acme/hostrig/portfolio-web:abcdef12-3456-78")
  })

  it("stable pull secret names from registry id", () => {
    expect(registryPullSecretName("a1b2c3d4-e5f6-7890")).toBe(
      "hostrig-reg-a1b2c3d4e5f6",
    )
  })
})

describe("registry kind defaults", () => {
  afterEach(() => {
    // no env mutation in pure kind tests
  })

  it("locks ghcr and dockerhub servers", async () => {
    const { resolveRegistryServer, kindDefaults } = await import(
      "@/lib/registries/kinds"
    )
    expect(resolveRegistryServer("ghcr")).toBe("ghcr.io")
    expect(resolveRegistryServer("dockerhub")).toBe(
      "https://index.docker.io/v1/",
    )
    expect(kindDefaults("ghcr").imagePrefixHint).toContain("ghcr.io")
  })
})
