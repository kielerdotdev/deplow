import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  analyzeDirectory,
  assertAnalysisFresh,
  cacheAnalysis,
  clearAnalysisCache,
  findApplicationRoots,
  findDockerfiles,
  fingerprintAnalysis,
} from "./source-analysis.service"

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix))
}

function write(dir: string, rel: string, content: string) {
  const abs = path.join(dir, rel)
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, content)
}

function mockRailpack(info: object, plan: object) {
  return async (
    _cmd: string,
    args: string[],
  ): Promise<{ code: number; stdout: string; stderr: string }> => {
    const infoIdx = args.indexOf("--info-out")
    const planIdx = args.indexOf("--plan-out")
    if (infoIdx >= 0) writeFileSync(args[infoIdx + 1]!, JSON.stringify(info))
    if (planIdx >= 0) writeFileSync(args[planIdx + 1]!, JSON.stringify(plan))
    return { code: 0, stdout: "", stderr: "" }
  }
}

afterEach(() => {
  clearAnalysisCache()
})

describe("findDockerfiles", () => {
  it("finds root and nested Dockerfiles", () => {
    const dir = tempDir("deplow-df-")
    try {
      write(dir, "Dockerfile", "FROM alpine\n")
      write(dir, "apps/api/Dockerfile", "FROM node\n")
      expect(findDockerfiles(dir)).toEqual([
        "Dockerfile",
        "apps/api/Dockerfile",
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("findApplicationRoots", () => {
  it("detects monorepo app roots", () => {
    const dir = tempDir("deplow-apps-")
    try {
      write(dir, "apps/web/package.json", '{"name":"web"}')
      write(dir, "apps/api/package.json", '{"name":"api"}')
      write(dir, "packages/shared/package.json", '{"name":"shared"}')
      const roots = findApplicationRoots(dir)
      expect(roots).toContain("apps/web")
      expect(roots).toContain("apps/api")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("analyzeDirectory", () => {
  it("selects railpack when no Dockerfile and returns Railpack metadata", async () => {
    const dir = tempDir("deplow-rp-")
    try {
      write(
        dir,
        "package.json",
        JSON.stringify({ name: "api", scripts: { start: "node index.js" } }),
      )
      const result = await analyzeDirectory({
        sourcePath: dir,
        repoName: "my-api",
        runCommand: mockRailpack(
          {
            detectedProviders: ["node"],
            metadata: { nodeRuntime: "node", providers: "node" },
            success: true,
          },
          { deploy: { startCommand: "npm run start" } },
        ),
      })
      expect(result.strategy).toBe("railpack")
      expect(result.runtime).toBe("node")
      expect(result.startCommand).toBe("npm run start")
      expect(result.suggestedName).toBe("my-api")
      expect(result.needsChoice).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("auto-selects root Dockerfile", async () => {
    const dir = tempDir("deplow-root-df-")
    try {
      write(dir, "Dockerfile", "FROM alpine\nEXPOSE 80\n")
      write(dir, "package.json", '{"name":"x"}')
      const result = await analyzeDirectory({
        sourcePath: dir,
        repoName: "web",
        runCommand: async () => ({ code: 1, stdout: "", stderr: "unused" }),
      })
      expect(result.strategy).toBe("dockerfile")
      expect(result.dockerfilePath).toBe("Dockerfile")
      expect(result.suggestedType).toBe("web")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("auto-selects a single nested Dockerfile", async () => {
    const dir = tempDir("deplow-nested-df-")
    try {
      write(dir, "services/api/Dockerfile", "FROM node\n")
      write(dir, "README.md", "# hi\n")
      const result = await analyzeDirectory({
        sourcePath: dir,
        repoName: "mono",
        runCommand: async () => ({ code: 1, stdout: "", stderr: "unused" }),
      })
      expect(result.strategy).toBe("dockerfile")
      expect(result.dockerfilePath).toBe("services/api/Dockerfile")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("requires choice when multiple Dockerfiles exist without a root one", async () => {
    const dir = tempDir("deplow-multi-df-")
    try {
      write(dir, "apps/api/Dockerfile", "FROM node\n")
      write(dir, "apps/web/Dockerfile", "FROM nginx\n")
      const multi = await analyzeDirectory({
        sourcePath: dir,
        repoName: "multi",
        runCommand: async () => ({ code: 1, stdout: "", stderr: "unused" }),
      })
      expect(multi.needsChoice).toBe("dockerfile")
      expect(multi.strategy).toBeNull()
      expect(multi.errors[0]).toMatch(/Multiple Dockerfiles/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("prefers a standard root Dockerfile over nested ones", async () => {
    const dir = tempDir("deplow-root-wins-")
    try {
      write(dir, "Dockerfile", "FROM alpine\n")
      write(dir, "apps/api/Dockerfile", "FROM node\n")
      const result = await analyzeDirectory({
        sourcePath: dir,
        repoName: "multi",
        runCommand: async () => ({ code: 1, stdout: "", stderr: "unused" }),
      })
      expect(result.strategy).toBe("dockerfile")
      expect(result.dockerfilePath).toBe("Dockerfile")
      expect(result.needsChoice).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("requires application choice for monorepos with multiple apps", async () => {
    const dir = tempDir("deplow-mono-")
    try {
      write(
        dir,
        "apps/web/package.json",
        '{"name":"web","scripts":{"start":"next start"}}',
      )
      write(
        dir,
        "apps/api/package.json",
        '{"name":"api","scripts":{"start":"node server.js"}}',
      )
      const result = await analyzeDirectory({
        sourcePath: dir,
        repoName: "platform",
        runCommand: mockRailpack(
          { detectedProviders: ["node"], success: true },
          { deploy: { startCommand: "npm start" } },
        ),
      })
      expect(result.needsChoice).toBe("application")
      expect(result.errors[0]).toMatch(/Multiple applications/)
      expect(result.applications.length).toBeGreaterThanOrEqual(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("infers worker from start command", async () => {
    const dir = tempDir("deplow-worker-")
    try {
      write(
        dir,
        "package.json",
        JSON.stringify({
          name: "worker",
          scripts: { start: "node worker.js" },
        }),
      )
      const result = await analyzeDirectory({
        sourcePath: dir,
        repoName: "jobs",
        runCommand: mockRailpack(
          { detectedProviders: ["node"], success: true },
          { deploy: { startCommand: "npm run worker" } },
        ),
      })
      expect(result.suggestedType).toBe("worker")
      expect(result.typeConfidence).toBe("high")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("reports missing start command for Railpack apps", async () => {
    const dir = tempDir("deplow-nostart-")
    try {
      write(dir, "package.json", '{"name":"x"}')
      const result = await analyzeDirectory({
        sourcePath: dir,
        repoName: "x",
        runCommand: mockRailpack(
          { detectedProviders: ["node"], success: true },
          { deploy: {} },
        ),
      })
      expect(result.errors).toContain("No start command detected.")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("analysis fingerprint staleness", () => {
  it("rejects stale fingerprints", () => {
    const result = {
      analysisId: "a1",
      fingerprint: fingerprintAnalysis({
        repoUrl: "https://github.com/acme/api.git",
        branch: "main",
        rootDirectory: ".",
        dockerfilePath: null,
      }),
      strategy: "railpack" as const,
      dockerfilePath: null,
      applicationRoot: ".",
      runtime: "node",
      framework: null,
      startCommand: "npm start",
      buildCommand: null,
      suggestedName: "api",
      suggestedType: "web" as const,
      typeConfidence: "high" as const,
      needsChoice: null,
      dockerfiles: [],
      applications: ["."],
      errors: [],
    }
    cacheAnalysis(result)
    expect(() =>
      assertAnalysisFresh({
        analysisId: "a1",
        fingerprint: fingerprintAnalysis({
          repoUrl: "https://github.com/acme/api.git",
          branch: "develop",
          rootDirectory: ".",
          dockerfilePath: null,
        }),
      }),
    ).toThrow(/re-run analysis/)
  })

  it("accepts matching fingerprint", () => {
    const fp = fingerprintAnalysis({
      repoUrl: "https://github.com/acme/api.git",
      branch: "main",
    })
    cacheAnalysis({
      analysisId: "a2",
      fingerprint: fp,
      strategy: "railpack",
      dockerfilePath: null,
      applicationRoot: ".",
      runtime: "node",
      framework: null,
      startCommand: "npm start",
      buildCommand: null,
      suggestedName: "api",
      suggestedType: "web",
      typeConfidence: "high",
      needsChoice: null,
      dockerfiles: [],
      applications: ["."],
      errors: [],
    })
    expect(
      assertAnalysisFresh({ analysisId: "a2", fingerprint: fp }).analysisId,
    ).toBe("a2")
  })
})
