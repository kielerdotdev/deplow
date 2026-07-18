import { describe, expect, it } from "vitest"

import {
  BuildService,
  prepareRailpackNodeLockfiles,
  prepareRailpackNodeVersion,
  selectBuildStrategy,
} from "./build.service"

describe("selectBuildStrategy", () => {
  it("selects image when only image is provided", () => {
    expect(selectBuildStrategy({ image: "nginx:alpine" })).toBe("image")
  })

  it("defaults to railpack even when a Dockerfile is present", () => {
    expect(
      selectBuildStrategy({
        sourcePath: "/app",
        hasDockerfile: true,
      }),
    ).toBe("railpack")
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

  it("uses Dockerfile only when explicitly overridden", () => {
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
    expect(
      selectBuildStrategy({
        sourcePath: "/app",
        hasDockerfile: true,
        strategyOverride: "auto",
      }),
    ).toBe("railpack")
  })
})

describe("BuildService.buildFromSource", () => {
  it("runs railpack by default even when a Dockerfile exists", async () => {
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hostrig-build-"))
    fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM alpine\n")
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ scripts: { start: "node server.js" } }),
    )
    try {
      const result = await service.buildFromSource({
        sourcePath: dir,
        projectSlug: "demo",
        deploymentId: "dep1",
      })
      expect(result.strategy).toBe("railpack")
      expect(result.image).toBe("hostrig/demo:dep1")
      expect(calls[0]?.[0]).toBe("railpack")
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hostrig-custom-df-"))
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hostrig-root-"))
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hostrig-astro-build-"))
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hostrig-rail-"))
    fs.writeFileSync(path.join(dir, "package.json"), '{"name":"x"}')
    try {
      const result = await service.buildFromSource({
        sourcePath: dir,
        projectSlug: "demo",
        deploymentId: "dep2",
      })
      expect(result.strategy).toBe("railpack")
      expect(result.image).toBe("hostrig/demo:dep2")
      expect(calls[0]?.[0]).toBe("railpack")
      expect(calls[0]).toContain("build")
      expect(calls[0]).toContain("--name")
      expect(calls[0]).toContain("hostrig/demo:dep2")
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hostrig-rail-fail-"))
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

  it("uses railpack by default when a local-dev Dockerfile is present", async () => {
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hostrig-dev-df-"))
    fs.writeFileSync(
      path.join(dir, "Dockerfile"),
      "FROM node:14\nWORKDIR /app\nCOPY . .\nCMD npm run dev\n",
    )
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        scripts: { dev: "next dev", build: "next build", start: "next start" },
      }),
    )
    fs.writeFileSync(path.join(dir, "package-lock.json"), "{}")
    try {
      const result = await service.buildFromSource({
        sourcePath: dir,
        projectSlug: "demo",
        deploymentId: "dep-dev",
        startCommand: "npm run start",
      })
      expect(result.strategy).toBe("railpack")
      expect(calls[0]?.[0]).toBe("railpack")
      expect(calls[0]).toContain("--build-cmd")
      expect(calls[0]).toContain("npm run build")
      expect(calls.some((c) => c[0] === "docker")).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("keeps dockerfile strategy when override forces it despite dev CMD", async () => {
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hostrig-force-df-"))
    fs.writeFileSync(
      path.join(dir, "Dockerfile"),
      "FROM node:14\nCMD npm run dev\n",
    )
    try {
      const result = await service.buildFromSource({
        sourcePath: dir,
        projectSlug: "demo",
        deploymentId: "dep-force",
        strategyOverride: "dockerfile",
      })
      expect(result.strategy).toBe("dockerfile")
      expect(calls[0]?.[0]).toBe("docker")
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hostrig-locks-"))
    fs.writeFileSync(path.join(dir, "package.json"), '{"name":"x"}')
    fs.writeFileSync(path.join(dir, "package-lock.json"), "{}")
    fs.writeFileSync(path.join(dir, "bun.lock"), "{}")
    try {
      const notes = prepareRailpackNodeLockfiles(dir)
      expect(notes.join("\n")).toMatch(/Using npm for Railpack/)
      expect(fs.existsSync(path.join(dir, "bun.lock"))).toBe(false)
      expect(fs.existsSync(path.join(dir, "bun.lock.hostrig-ignored"))).toBe(
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hostrig-locks-bun-"))
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

describe("prepareRailpackNodeVersion", () => {
  it("pins Node 16 for Next.js 10 when no engines/.nvmrc", async () => {
    const fs = await import("node:fs")
    const path = await import("node:path")
    const os = await import("node:os")
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hostrig-nodepin-"))
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        dependencies: { next: "10.0.9", react: "17.0.2" },
      }),
    )
    try {
      const notes = prepareRailpackNodeVersion(dir)
      expect(notes.join("\n")).toMatch(/Pinned Node 16/)
      expect(
        fs.readFileSync(path.join(dir, ".node-version"), "utf8").trim(),
      ).toBe("16")
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("does not override an existing .nvmrc", async () => {
    const fs = await import("node:fs")
    const path = await import("node:path")
    const os = await import("node:os")
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hostrig-nvmrc-"))
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ dependencies: { next: "10.0.9" } }),
    )
    fs.writeFileSync(path.join(dir, ".nvmrc"), "14\n")
    try {
      expect(prepareRailpackNodeVersion(dir)).toEqual([])
      expect(fs.readFileSync(path.join(dir, ".nvmrc"), "utf8").trim()).toBe(
        "14",
      )
      expect(fs.existsSync(path.join(dir, ".node-version"))).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
