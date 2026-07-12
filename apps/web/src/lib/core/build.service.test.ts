import { describe, expect, it } from "vitest"

import {
  BuildService,
  prepareRailpackNodeLockfiles,
  selectBuildStrategy,
} from "./build.service"

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

  it("honors strategy overrides", () => {
    expect(
      selectBuildStrategy({
        sourcePath: "/app",
        hasDockerfile: true,
        strategyOverride: "railpack",
      }),
    ).toBe("railpack")
    expect(
      selectBuildStrategy({
        sourcePath: "/app",
        hasDockerfile: false,
        strategyOverride: "dockerfile",
      }),
    ).toBe("dockerfile")
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

  it("passes -f for a custom Dockerfile path", async () => {
    const calls: string[][] = []
    const service = new BuildService({
      runCommand: async (cmd, args) => {
        calls.push([cmd, ...args])
        return { code: 0, stdout: "built", stderr: "" }
      },
    })
    const fs = await import("node:fs")
    const path = await import("node:path")
    const os = await import("node:os")
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deplow-custom-df-"))
    fs.mkdirSync(path.join(dir, "docker"), { recursive: true })
    fs.writeFileSync(
      path.join(dir, "docker", "Dockerfile.app"),
      "FROM alpine\n",
    )
    try {
      const result = await service.buildFromSource({
        sourcePath: dir,
        projectSlug: "demo",
        deploymentId: "dep3",
        dockerfilePath: "docker/Dockerfile.app",
        strategyOverride: "dockerfile",
      })
      expect(result.strategy).toBe("dockerfile")
      expect(calls[0]).toContain("-f")
      const fIdx = calls[0]!.indexOf("-f")
      expect(calls[0]![fIdx + 1]).toContain("Dockerfile.app")
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("builds from a root subdirectory", async () => {
    const calls: string[][] = []
    const service = new BuildService({
      railpackBin: "railpack",
      runCommand: async (cmd, args) => {
        calls.push([cmd, ...args])
        return { code: 0, stdout: "ok", stderr: "" }
      },
    })
    const fs = await import("node:fs")
    const path = await import("node:path")
    const os = await import("node:os")
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deplow-root-"))
    fs.mkdirSync(path.join(dir, "apps", "api"), { recursive: true })
    fs.writeFileSync(
      path.join(dir, "apps", "api", "package.json"),
      '{"name":"api"}',
    )
    try {
      await service.buildFromSource({
        sourcePath: dir,
        projectSlug: "demo",
        deploymentId: "dep4",
        rootDirectory: "apps/api",
        strategyOverride: "railpack",
        startCommand: "npm start",
      })
      expect(calls[0]?.[0]).toBe("railpack")
      expect(calls[0]).toContain("--start-cmd")
      expect(calls[0]?.at(-1)).toContain("apps/api")
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("rewrites astro dev start commands for railpack", async () => {
    const calls: string[][] = []
    const service = new BuildService({
      railpackBin: "railpack",
      runCommand: async (cmd, args) => {
        calls.push([cmd, ...args])
        return { code: 0, stdout: "ok", stderr: "" }
      },
    })
    const fs = await import("node:fs")
    const path = await import("node:path")
    const os = await import("node:os")
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deplow-astro-build-"))
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        scripts: { start: "astro dev", preview: "astro preview" },
      }),
    )
    try {
      await service.buildFromSource({
        sourcePath: dir,
        projectSlug: "demo",
        deploymentId: "dep-astro",
        strategyOverride: "railpack",
        startCommand: "bun run start",
      })
      const startIdx = calls[0]!.indexOf("--start-cmd")
      expect(calls[0]![startIdx + 1]).toBe(
        "astro preview --host 0.0.0.0 --port ${PORT}",
      )
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

  it("surfaces a hint when bun frozen-lockfile fails", async () => {
    const service = new BuildService({
      railpackBin: "railpack",
      runCommand: async () => ({
        code: 1,
        stdout: "",
        stderr:
          "error: lockfile had changes, but lockfile is frozen\nunrecognized image format",
      }),
    })

    const fs = await import("node:fs")
    const path = await import("node:path")
    const os = await import("node:os")
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deplow-rail-fail-"))
    fs.writeFileSync(path.join(dir, "package.json"), '{"name":"x"}')
    try {
      await expect(
        service.buildFromSource({
          sourcePath: dir,
          projectSlug: "demo",
          deploymentId: "dep3",
        }),
      ).rejects.toThrow(/Bun lockfile is out of sync/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("prepareRailpackNodeLockfiles", () => {
  it("stashes bun.lock when package-lock.json exists without packageManager bun", async () => {
    const fs = await import("node:fs")
    const path = await import("node:path")
    const os = await import("node:os")
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deplow-locks-"))
    fs.writeFileSync(path.join(dir, "package.json"), '{"name":"x"}')
    fs.writeFileSync(path.join(dir, "package-lock.json"), "{}")
    fs.writeFileSync(path.join(dir, "bun.lock"), "{}")
    try {
      const notes = prepareRailpackNodeLockfiles(dir)
      expect(notes.join("\n")).toMatch(/Using npm for Railpack/)
      expect(fs.existsSync(path.join(dir, "bun.lock"))).toBe(false)
      expect(fs.existsSync(path.join(dir, "bun.lock.deplow-ignored"))).toBe(
        true,
      )
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("keeps bun.lock when packageManager is bun", async () => {
    const fs = await import("node:fs")
    const path = await import("node:path")
    const os = await import("node:os")
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deplow-locks-bun-"))
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "x", packageManager: "bun@1.1.0" }),
    )
    fs.writeFileSync(path.join(dir, "package-lock.json"), "{}")
    fs.writeFileSync(path.join(dir, "bun.lock"), "{}")
    try {
      const notes = prepareRailpackNodeLockfiles(dir)
      expect(notes).toEqual([])
      expect(fs.existsSync(path.join(dir, "bun.lock"))).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
