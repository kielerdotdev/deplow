import { describe, expect, it } from "vitest"

import { BuildService, selectBuildStrategy } from "./build.service"

describe("selectBuildStrategy", () => {
  it("selects image when only image is provided", () => {
    expect(selectBuildStrategy({ image: "nginx:alpine" })).toBe("image")
  })

  it("selects dockerfile when source has Dockerfile", () => {
    expect(
      selectBuildStrategy({
        sourcePath: "/app",
        hasDockerfile: true,
      }),
    ).toBe("dockerfile")
  })

  it("selects railpack when source has no Dockerfile", () => {
    expect(
      selectBuildStrategy({
        sourcePath: "/app",
        hasDockerfile: false,
      }),
    ).toBe("railpack")
  })

  it("prefers source build over image when both set", () => {
    expect(
      selectBuildStrategy({
        image: "ignored:latest",
        sourcePath: "/app",
        hasDockerfile: false,
      }),
    ).toBe("railpack")
  })

  it("throws when neither image nor source is provided", () => {
    expect(() => selectBuildStrategy({})).toThrow(/image or sourcePath/)
  })
})

describe("BuildService.buildFromSource", () => {
  it("runs docker build when Dockerfile strategy is selected", async () => {
    const calls: string[][] = []
    const service = new BuildService({
      runCommand: async (cmd, args) => {
        calls.push([cmd, ...args])
        return { code: 0, stdout: "built", stderr: "" }
      },
    })

    // Force dockerfile path by pointing at a real path that we mark via detect
    // We inject by using a temp that won't exist for detect — use hasDockerfile via
    // runCommand only after strategy. Instead spy through custom path:
    // Call internal by mocking detect: build with runCommand and a path that exists.
    // Use process.cwd() which may or may not have Dockerfile — force via
    // selecting by creating service and calling after monkey-patch is hard.
    // Test command construction via dockerfile branch by temporarily using
    // existsSync through a source with Dockerfile in fixture under scratch.

    const fs = await import("node:fs")
    const path = await import("node:path")
    const os = await import("node:os")
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deplow-build-"))
    fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM alpine\n")
    try {
      const result = await service.buildFromSource({
        sourcePath: dir,
        projectSlug: "demo",
        deploymentId: "dep1",
      })
      expect(result.strategy).toBe("dockerfile")
      expect(result.image).toBe("deplow/demo:dep1")
      expect(calls[0]?.[0]).toBe("docker")
      expect(calls[0]).toContain("build")
      expect(calls[0]).toContain("deplow/demo:dep1")
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("runs railpack when no Dockerfile is present", async () => {
    const calls: string[][] = []
    const service = new BuildService({
      railpackBin: "railpack",
      buildkitHost: "docker-container://buildkit",
      runCommand: async (cmd, args) => {
        calls.push([cmd, ...args])
        return { code: 0, stdout: "ok", stderr: "" }
      },
    })

    const fs = await import("node:fs")
    const path = await import("node:path")
    const os = await import("node:os")
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deplow-rail-"))
    fs.writeFileSync(path.join(dir, "package.json"), '{"name":"x"}')
    try {
      const result = await service.buildFromSource({
        sourcePath: dir,
        projectSlug: "demo",
        deploymentId: "dep2",
      })
      expect(result.strategy).toBe("railpack")
      expect(result.image).toBe("deplow/demo:dep2")
      expect(calls[0]?.[0]).toBe("railpack")
      expect(calls[0]).toContain("build")
      expect(calls[0]).toContain("--name")
      expect(calls[0]).toContain("deplow/demo:dep2")
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
