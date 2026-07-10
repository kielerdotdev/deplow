import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

export type BuildStrategy = "dockerfile" | "railpack" | "image"

export interface BuildSelectionInput {
  /** Prebuilt registry/local image (no source build) */
  image?: string
  /** Absolute path to application source */
  sourcePath?: string
  /** When true, source tree contains a Dockerfile (caller may pre-detect) */
  hasDockerfile?: boolean
}

/**
 * Pure selection rules for how a deployment is produced.
 * - image only → pull/run image
 * - source + Dockerfile → docker build
 * - source without Dockerfile → railpack
 */
export function selectBuildStrategy(input: BuildSelectionInput): BuildStrategy {
  const image = input.image?.trim()
  const sourcePath = input.sourcePath?.trim()

  if (image && !sourcePath) {
    return "image"
  }
  if (sourcePath) {
    const hasDockerfile =
      input.hasDockerfile ??
      (existsSync(path.join(sourcePath, "Dockerfile")) ||
        existsSync(path.join(sourcePath, "dockerfile")))
    return hasDockerfile ? "dockerfile" : "railpack"
  }
  throw new Error("Either image or sourcePath is required for deploy")
}

export function detectDockerfile(sourcePath: string): boolean {
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

export interface BuildServiceOptions {
  /** Path to railpack binary (default: railpack on PATH) */
  railpackBin?: string
  /** BUILDKIT_HOST for railpack, e.g. docker-container://buildkit */
  buildkitHost?: string
  /** Override docker binary */
  dockerBin?: string
  /** For tests: inject command runner */
  runCommand?: (
    cmd: string,
    args: string[],
    env?: Record<string, string>,
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
    this.railpackBin =
      options.railpackBin ?? process.env.RAILPACK_BIN ?? "railpack"
    this.dockerBin = options.dockerBin ?? "docker"
    this.buildkitHost =
      options.buildkitHost ??
      process.env.BUILDKIT_HOST ??
      "docker-container://buildkit"
    this.runCommand = options.runCommand ?? defaultRunCommand
  }

  imageTag(projectSlug: string, deploymentId: string): string {
    return `deplow/${projectSlug}:${deploymentId}`
  }

  async buildFromSource(input: {
    sourcePath: string
    projectSlug: string
    deploymentId: string
  }): Promise<BuildResult> {
    const sourcePath = path.resolve(input.sourcePath)
    if (!existsSync(sourcePath)) {
      throw new Error(`Source path does not exist: ${sourcePath}`)
    }

    const hasDockerfile = detectDockerfile(sourcePath)
    const strategy = selectBuildStrategy({
      sourcePath,
      hasDockerfile,
    })
    const image = this.imageTag(input.projectSlug, input.deploymentId)

    if (strategy === "dockerfile") {
      const result = await this.runCommand(this.dockerBin, [
        "build",
        "-t",
        image,
        sourcePath,
      ])
      const logs = formatLogs("dockerfile", result)
      if (result.code !== 0) {
        throw new Error(`docker build failed:\n${logs}`)
      }
      return { strategy, image, logs }
    }

    // railpack
    const env: Record<string, string> = {
      ...process.env,
      BUILDKIT_HOST: this.buildkitHost ?? "",
    }
    const result = await this.runCommand(
      this.railpackBin,
      ["build", "--name", image, "--progress", "plain", sourcePath],
      env,
    )
    const logs = formatLogs("railpack", result)
    if (result.code !== 0) {
      throw new Error(`railpack build failed:\n${logs}`)
    }
    return { strategy: "railpack", image, logs }
  }
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

function defaultRunCommand(
  cmd: string,
  args: string[],
  env?: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: env ?? process.env,
      shell: false,
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8")
    })
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8")
    })
    child.on("error", (err) => {
      resolve({
        code: 1,
        stdout,
        stderr: `${stderr}\n${err.message}`,
      })
    })
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}
