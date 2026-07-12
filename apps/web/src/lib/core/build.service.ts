import { spawn } from "node:child_process"
import { existsSync, readFileSync, renameSync } from "node:fs"
import path from "node:path"

import {
  normalizeProductionStartCommand,
  resolveProductionBuildCommand,
} from "./normalize-start-command"

export type BuildStrategy = "dockerfile" | "railpack" | "image"
export type BuildStrategyOverride = "auto" | "railpack" | "dockerfile"

export interface BuildSelectionInput {
  image?: string
  sourcePath?: string
  hasDockerfile?: boolean
  strategyOverride?: BuildStrategyOverride | null
  dockerfilePath?: string | null
}

/**
 * Pure selection rules for how a deployment is produced.
 * - image only → pull/run image
 * - strategyOverride dockerfile → docker build (manual only)
 * - source (auto / railpack / unset) → always Railpack
 */
export function selectBuildStrategy(input: BuildSelectionInput): BuildStrategy {
  const image = input.image?.trim()
  const sourcePath = input.sourcePath?.trim()
  const override = input.strategyOverride

  if (image && !sourcePath) return "image"

  if (sourcePath) {
    if (override === "dockerfile") return "dockerfile"
    return "railpack"
  }

  throw new Error("Either image or sourcePath is required for deploy")
}

export function detectDockerfile(
  sourcePath: string,
  dockerfilePath?: string | null,
): boolean {
  if (dockerfilePath) {
    const abs = path.isAbsolute(dockerfilePath)
      ? dockerfilePath
      : path.join(sourcePath, dockerfilePath)
    return existsSync(abs)
  }
  return (
    existsSync(path.join(sourcePath, "Dockerfile")) ||
    existsSync(path.join(sourcePath, "dockerfile"))
  )
}

export interface BuildResult {
  strategy: BuildStrategy
  image: string
  logs: string
}

export interface BuildFromSourceInput {
  sourcePath: string
  projectSlug: string
  deploymentId: string
  rootDirectory?: string | null
  dockerfilePath?: string | null
  strategyOverride?: BuildStrategyOverride | null
  buildCommand?: string | null
  startCommand?: string | null
  /** Called with stdout/stderr chunks as the build runs (for live log preview). */
  onLog?: (chunk: string) => void
}

export interface BuildServiceOptions {
  railpackBin?: string
  buildkitHost?: string
  dockerBin?: string
  runCommand?: (
    cmd: string,
    args: string[],
    env?: Record<string, string>,
    onOutput?: (chunk: string) => void,
  ) => Promise<{ code: number; stdout: string; stderr: string }>
}

/**
 * Builds deployable images from source via Dockerfile or Railpack.
 */
export class BuildService {
  private readonly railpackBin: string
  private readonly dockerBin: string
  private readonly buildkitHost?: string
  private readonly runCommand: NonNullable<BuildServiceOptions["runCommand"]>

  constructor(options: BuildServiceOptions = {}) {
    this.railpackBin = options.railpackBin ?? process.env.RAILPACK_BIN ?? "railpack"
    this.dockerBin = options.dockerBin ?? "docker"
    this.buildkitHost =
      options.buildkitHost ?? process.env.BUILDKIT_HOST ?? "docker-container://buildkit"
    this.runCommand = options.runCommand ?? defaultRunCommand
  }

  imageTag(projectSlug: string, deploymentId: string): string {
    return `deplow/${projectSlug}:${deploymentId}`
  }

  async buildFromSource(input: BuildFromSourceInput): Promise<BuildResult> {
    const repoRoot = path.resolve(input.sourcePath)
    if (!existsSync(repoRoot)) {
      throw new Error(`Source path does not exist: ${repoRoot}`)
    }

    const contextPath = resolveRootDirectory(repoRoot, input.rootDirectory)
    if (!existsSync(contextPath)) {
      throw new Error(
        `Root directory does not exist: ${input.rootDirectory ?? "."}`,
      )
    }

    const dockerfileAbs = resolveDockerfileAbsolute(
      repoRoot,
      contextPath,
      input.dockerfilePath,
    )
    let strategy = selectBuildStrategy({
      sourcePath: contextPath,
      hasDockerfile:
        Boolean(dockerfileAbs) || detectDockerfile(contextPath, null),
      strategyOverride: input.strategyOverride,
      dockerfilePath: dockerfileAbs,
    })
    const image = this.imageTag(input.projectSlug, input.deploymentId)

    if (strategy === "dockerfile") {
      return this.buildWithDockerfile(
        contextPath,
        image,
        dockerfileAbs
          ? path.relative(contextPath, dockerfileAbs) ||
              path.basename(dockerfileAbs)
          : null,
        dockerfileAbs,
        input.onLog,
      )
    }
    return this.buildWithRailpack(
      contextPath,
      image,
      {
        buildCommand: resolveProductionBuildCommand(
          input.buildCommand,
          contextPath,
          input.startCommand,
        ),
        startCommand: normalizeProductionStartCommand(
          input.startCommand,
          contextPath,
        ),
      },
      input.onLog,
    )
  }

  private async buildWithDockerfile(
    sourcePath: string,
    image: string,
    dockerfileRel: string | null,
    dockerfileAbs: string | null,
    onLog?: (chunk: string) => void,
  ): Promise<BuildResult> {
    const args = ["build", "-t", image]
    if (dockerfileAbs) {
      args.push("-f", dockerfileAbs)
    } else if (dockerfileRel) {
      const resolved = resolveDockerfilePath(sourcePath, dockerfileRel)
      if (!resolved) {
        throw new Error(`Dockerfile not found at ${dockerfileRel}`)
      }
      args.push("-f", resolved)
    }
    args.push(sourcePath)

    onLog?.("=== dockerfile ===\n")
    const result = await this.runCommand(
      this.dockerBin,
      args,
      { ...process.env, DOCKER_BUILDKIT: "1" },
      onLog,
    )
    if (result.code !== 0) {
      throw new Error(
        `docker build failed:\n${formatLogs("dockerfile", result)}`,
      )
    }
    return {
      strategy: "dockerfile",
      image,
      logs: formatLogs("dockerfile", result),
    }
  }

  private async buildWithRailpack(
    sourcePath: string,
    image: string,
    cmds: { buildCommand?: string | null; startCommand?: string | null },
    onLog?: (chunk: string) => void,
  ): Promise<BuildResult> {
    const prepNotes = prepareRailpackNodeLockfiles(sourcePath)
    if (prepNotes.length) onLog?.(`${prepNotes.join("\n")}\n`)
    const env: Record<string, string> = {
      ...process.env,
      BUILDKIT_HOST: this.buildkitHost ?? "",
    }
    const args = ["build", "--name", image, "--progress", "plain"]
    if (cmds.buildCommand?.trim()) {
      args.push("--build-cmd", cmds.buildCommand.trim())
    }
    if (cmds.startCommand?.trim()) {
      args.push("--start-cmd", cmds.startCommand.trim())
    }
    args.push(sourcePath)

    onLog?.("=== railpack ===\n")
    const result = await this.runCommand(this.railpackBin, args, env, onLog)
    if (result.code !== 0) {
      throw new Error(
        `railpack build failed:\n${formatLogs("railpack", result)}${explainRailpackFailure(result)}`,
      )
    }
    const logs = [prepNotes.join("\n"), formatLogs("railpack", result)]
      .filter(Boolean)
      .join("\n")
    return { strategy: "railpack", image, logs }
  }
}

export function resolveRootDirectory(
  repoRoot: string,
  rootDirectory?: string | null,
): string {
  const root = (rootDirectory ?? ".").trim() || "."
  if (root === "." || root === "") return repoRoot
  const resolved = path.resolve(repoRoot, root)
  if (!resolved.startsWith(path.resolve(repoRoot))) {
    throw new Error(`Root directory escapes repository: ${rootDirectory}`)
  }
  return resolved
}

/** Resolve Dockerfile path relative to build context (or absolute). */
export function resolveDockerfilePath(
  contextPath: string,
  dockerfilePath: string,
): string | null {
  if (path.isAbsolute(dockerfilePath) && existsSync(dockerfilePath)) {
    return dockerfilePath
  }
  const underContext = path.join(contextPath, dockerfilePath)
  if (existsSync(underContext)) return underContext
  const base = path.basename(dockerfilePath)
  const nested = path.join(contextPath, base)
  if (existsSync(nested)) return nested
  return null
}

export function resolveDockerfileAbsolute(
  repoRoot: string,
  contextPath: string,
  dockerfilePath?: string | null,
): string | null {
  const rel = dockerfilePath?.trim()
  if (!rel) {
    if (existsSync(path.join(contextPath, "Dockerfile"))) {
      return path.join(contextPath, "Dockerfile")
    }
    if (existsSync(path.join(contextPath, "dockerfile"))) {
      return path.join(contextPath, "dockerfile")
    }
    return null
  }
  if (path.isAbsolute(rel) && existsSync(rel)) return rel
  const fromRepo = path.join(repoRoot, rel)
  if (existsSync(fromRepo)) return fromRepo
  const fromContext = path.join(contextPath, rel)
  if (existsSync(fromContext)) return fromContext
  return null
}

function formatLogs(
  label: string,
  result: { stdout: string; stderr: string; code: number },
): string {
  return [
    `=== ${label} (exit ${result.code}) ===`,
    result.stdout.trim(),
    result.stderr.trim(),
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * Railpack prefers bun.lock over package-lock.json. Dual lockfiles with a stale
 * bun.lock fail as `bun install --frozen-lockfile`. When package.json does not
 * declare bun as packageManager, stash bun lockfiles so npm is used instead.
 */
export function prepareRailpackNodeLockfiles(sourcePath: string): string[] {
  const notes: string[] = []
  const pkgPath = path.join(sourcePath, "package.json")
  if (!existsSync(pkgPath)) return notes

  let packageManager = ""
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      packageManager?: string
    }
    packageManager = (pkg.packageManager ?? "").trim().toLowerCase()
  } catch {
    return notes
  }

  if (packageManager.startsWith("bun@") || packageManager === "bun") {
    return notes
  }

  const hasNpmLock = existsSync(path.join(sourcePath, "package-lock.json"))
  if (!hasNpmLock) return notes

  for (const name of ["bun.lock", "bun.lockb"] as const) {
    const lockPath = path.join(sourcePath, name)
    if (!existsSync(lockPath)) continue
    const stashed = `${lockPath}.deplow-ignored`
    try {
      if (existsSync(stashed)) {
        renameSync(stashed, `${stashed}.${Date.now()}`)
      }
      renameSync(lockPath, stashed)
      notes.push(
        `=== deplow ===\nFound ${name} alongside package-lock.json without packageManager: bun. Using npm for Railpack (moved ${name} aside).`,
      )
    } catch {
      notes.push(
        `=== deplow ===\nCould not move ${name} aside; Railpack may still pick Bun.`,
      )
    }
  }
  return notes
}

function explainRailpackFailure(result: {
  stdout: string
  stderr: string
}): string {
  const text = `${result.stdout}\n${result.stderr}`
  if (/lockfile had changes, but lockfile is frozen/i.test(text)) {
    return [
      "",
      "=== hint ===",
      "Bun lockfile is out of sync with package.json.",
      "Fix in the repo: run `bun install` and commit bun.lock, or delete bun.lock if you use npm (keep package-lock.json).",
      "If both lockfiles exist, set package.json \"packageManager\" or remove the unused lockfile.",
    ].join("\n")
  }
  if (/unrecognized image format/i.test(text)) {
    return [
      "",
      "=== hint ===",
      "Railpack did not produce a usable image (often a failed install/build step above).",
    ].join("\n")
  }
  return ""
}

function defaultRunCommand(
  cmd: string,
  args: string[],
  env?: Record<string, string>,
  onOutput?: (chunk: string) => void,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: env ?? process.env,
      shell: false,
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (d: Buffer) => {
      const text = d.toString("utf8")
      stdout += text
      onOutput?.(text)
    })
    child.stderr.on("data", (d: Buffer) => {
      const text = d.toString("utf8")
      stderr += text
      onOutput?.(text)
    })
    child.on("error", (err) => {
      const msg = `\n${err.message}`
      onOutput?.(msg)
      resolve({ code: 1, stdout, stderr: `${stderr}${msg}` })
    })
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}