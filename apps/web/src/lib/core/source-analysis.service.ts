/**
 * Repository source analysis for Add service.
 * Scans Dockerfiles / app roots on disk and uses Railpack's structured
 * prepare/info output — never executes application code.
 */

import { spawn } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import type { GitCloneAuth } from "./git-clone-auth"
import { GitService } from "./git.service"
import {
  isRailpackCaddyCommand,
  normalizeProductionStartCommand,
  resolveProductionBuildCommand,
} from "./normalize-start-command"

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "vendor",
  ".venv",
  "venv",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
  "__pycache__",
  ".cache",
  "target",
])

const MANIFEST_FILES = [
  "package.json",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
  "composer.json",
]

const MAX_WALK_DEPTH = 4

export type BuildStrategyChoice = "auto" | "railpack" | "dockerfile"

export type AnalysisNeedsChoice = "dockerfile" | "application" | null

export type AnalysisFingerprint = {
  repoUrl: string
  branch: string
  rootDirectory: string
  dockerfilePath: string | null
}

export type SourceAnalysisResult = {
  analysisId: string
  fingerprint: AnalysisFingerprint
  strategy: "railpack" | "dockerfile" | null
  dockerfilePath: string | null
  applicationRoot: string
  runtime: string | null
  framework: string | null
  startCommand: string | null
  buildCommand: string | null
  suggestedName: string
  suggestedType: "web" | "worker"
  typeConfidence: "high" | "low"
  needsChoice: AnalysisNeedsChoice
  dockerfiles: string[]
  applications: string[]
  errors: string[]
  /** Absolute path to cloned tree (server-only; not returned over API) */
  clonePath?: string
}

export type AnalyzeDirectoryInput = {
  sourcePath: string
  /** Repo display name for suggested service name */
  repoName?: string
  rootDirectory?: string
  dockerfilePath?: string | null
  strategyOverride?: BuildStrategyChoice
  railpackBin?: string
  runCommand?: (
    cmd: string,
    args: string[],
    cwd?: string,
    env?: Record<string, string>,
  ) => Promise<{ code: number; stdout: string; stderr: string }>
}

export type AnalyzeRemoteInput = {
  repoUrl: string
  branch: string
  repoFullName?: string
  rootDirectory?: string
  dockerfilePath?: string | null
  strategyOverride?: BuildStrategyChoice
  auth?: GitCloneAuth & { provider?: string }
  cloneRoot?: string
  railpackBin?: string
  gitService?: GitService
  runCommand?: AnalyzeDirectoryInput["runCommand"]
}

type CachedAnalysis = {
  result: SourceAnalysisResult
  expiresAt: number
}

const analysisCache = new Map<string, CachedAnalysis>()
const CACHE_TTL_MS = 30 * 60 * 1000

export function fingerprintAnalysis(input: {
  repoUrl: string
  branch: string
  rootDirectory?: string
  dockerfilePath?: string | null
}): AnalysisFingerprint {
  return {
    repoUrl: input.repoUrl.trim(),
    branch: input.branch.trim() || "main",
    rootDirectory: normalizeRoot(input.rootDirectory),
    dockerfilePath: input.dockerfilePath?.trim() || null,
  }
}

export function fingerprintsMatch(
  a: AnalysisFingerprint,
  b: AnalysisFingerprint,
): boolean {
  return (
    a.repoUrl === b.repoUrl &&
    a.branch === b.branch &&
    a.rootDirectory === b.rootDirectory &&
    (a.dockerfilePath ?? null) === (b.dockerfilePath ?? null)
  )
}

export function getCachedAnalysis(
  analysisId: string,
): SourceAnalysisResult | null {
  const entry = analysisCache.get(analysisId)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    analysisCache.delete(analysisId)
    return null
  }
  return entry.result
}

export function cacheAnalysis(result: SourceAnalysisResult): void {
  analysisCache.set(result.analysisId, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
}

export function clearAnalysisCache(): void {
  analysisCache.clear()
}

export function findDockerfiles(root: string): string[] {
  const found: string[] = []
  walk(root, root, 0, (abs, rel) => {
    const base = path.basename(abs)
    if (base === "Dockerfile" || base === "dockerfile") {
      found.push(rel === "" ? base : path.join(rel, base).replace(/\\/g, "/"))
    }
  })
  return found.sort()
}

export function findApplicationRoots(root: string): string[] {
  const roots = new Set<string>()

  if (hasManifest(root)) {
    roots.add(".")
  }

  walk(root, root, 0, (abs, rel) => {
    if (rel === "") return
    const st = statSync(abs)
    if (!st.isDirectory()) return
    if (hasManifest(abs)) {
      roots.add(rel.replace(/\\/g, "/"))
    }
  })

  // Prefer shallow roots: drop children of another selected root
  const sorted = [...roots].sort(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
  )
  const pruned: string[] = []
  for (const r of sorted) {
    const covered = pruned.some(
      (p) => r === p || (p !== "." && r.startsWith(`${p}/`)),
    )
    if (!covered) pruned.push(r)
  }
  return pruned
}

/**
 * Analyze a local checkout (tests + post-clone).
 */
export async function analyzeDirectory(
  input: AnalyzeDirectoryInput,
): Promise<SourceAnalysisResult> {
  const sourcePath = path.resolve(input.sourcePath)
  if (!existsSync(sourcePath)) {
    throw new Error(`Source path does not exist: ${sourcePath}`)
  }

  const analysisId = crypto.randomUUID()
  const errors: string[] = []
  const rootDirectory = normalizeRoot(input.rootDirectory)
  const appRootAbs = resolveUnder(sourcePath, rootDirectory)

  const allDockerfiles = findDockerfiles(sourcePath)
  const applications = findApplicationRoots(sourcePath)

  let needsChoice: AnalysisNeedsChoice = null
  let dockerfilePath: string | null = input.dockerfilePath?.trim() || null
  let selectedRoot = rootDirectory
  let strategy: "railpack" | "dockerfile" | null = null

  const override = input.strategyOverride ?? "auto"

  // Application selection for monorepos
  if (!input.rootDirectory && applications.length > 1) {
    needsChoice = "application"
  } else if (
    input.rootDirectory &&
    applications.length > 1 &&
    !applications.includes(normalizeRoot(input.rootDirectory))
  ) {
    // explicit root still allowed
  }

  if (needsChoice === "application") {
    return finalize({
      analysisId,
      fingerprint: fingerprintAnalysis({
        repoUrl: "",
        branch: "",
        rootDirectory: selectedRoot,
        dockerfilePath,
      }),
      strategy: null,
      dockerfilePath: null,
      applicationRoot: ".",
      runtime: null,
      framework: null,
      startCommand: null,
      buildCommand: null,
      suggestedName: suggestName(input.repoName, "."),
      suggestedType: "web",
      typeConfidence: "low",
      needsChoice,
      dockerfiles: allDockerfiles,
      applications,
      errors: ["Multiple applications found—select one."],
      clonePath: sourcePath,
    })
  }

  // Scope dockerfiles to selected root when set
  const scopedDockerfiles =
    selectedRoot === "."
      ? allDockerfiles
      : allDockerfiles.filter(
          (d) =>
            d === path.posix.join(selectedRoot, "Dockerfile") ||
            d === path.posix.join(selectedRoot, "dockerfile") ||
            d.startsWith(`${selectedRoot}/`),
        )

  // Dockerfile builds are opt-in only (strategyOverride === "dockerfile").
  // Auto / Railpack always analyze as Railpack so local-dev Dockerfiles cannot
  // take over the default path.
  if (override === "dockerfile") {
    if (dockerfilePath) {
      const abs = resolveUnder(sourcePath, dockerfilePath)
      if (!existsSync(abs)) {
        errors.push(`Dockerfile not found at ${dockerfilePath}`)
      } else {
        strategy = "dockerfile"
      }
    } else {
      const rootDf = scopedDockerfiles.find(
        (d) =>
          d === "Dockerfile" ||
          d === "dockerfile" ||
          d === path.posix.join(selectedRoot, "Dockerfile") ||
          d === path.posix.join(selectedRoot, "dockerfile"),
      )
      if (rootDf) {
        dockerfilePath = rootDf
        strategy = "dockerfile"
      } else if (scopedDockerfiles.length === 1) {
        dockerfilePath = scopedDockerfiles[0]!
        strategy = "dockerfile"
      } else if (scopedDockerfiles.length > 1) {
        needsChoice = "dockerfile"
        errors.push("Multiple Dockerfiles found—select one.")
      } else {
        errors.push("No Dockerfile found.")
      }
    }
  }

  if (needsChoice === "dockerfile") {
    return finalize({
      analysisId,
      fingerprint: fingerprintAnalysis({
        repoUrl: "",
        branch: "",
        rootDirectory: selectedRoot,
        dockerfilePath: null,
      }),
      strategy: null,
      dockerfilePath: null,
      applicationRoot: selectedRoot,
      runtime: null,
      framework: null,
      startCommand: null,
      buildCommand: null,
      suggestedName: suggestName(input.repoName, selectedRoot),
      suggestedType: "web",
      typeConfidence: "low",
      needsChoice,
      dockerfiles: scopedDockerfiles.length
        ? scopedDockerfiles
        : allDockerfiles,
      applications,
      errors,
      clonePath: sourcePath,
    })
  }

  let runtime: string | null = null
  let framework: string | null = null
  let startCommand: string | null = null
  let buildCommand: string | null = null

  if (
    override === "railpack" ||
    (override === "auto" && strategy !== "dockerfile")
  ) {
    strategy = "railpack"
    const railpack = await runRailpackAnalysis({
      directory: appRootAbs,
      railpackBin: input.railpackBin ?? process.env.RAILPACK_BIN ?? "railpack",
      runCommand: input.runCommand ?? defaultRunCommand,
    })
    if (railpack.error) {
      errors.push(railpack.error)
    }
    runtime = railpack.runtime
    framework = railpack.framework
    startCommand = normalizeProductionStartCommand(
      railpack.startCommand,
      appRootAbs,
    )
    buildCommand = resolveProductionBuildCommand(
      railpack.buildCommand,
      appRootAbs,
      startCommand ?? railpack.startCommand,
    )
    if (
      !startCommand &&
      !isRailpackCaddyCommand(railpack.startCommand)
    ) {
      errors.push("No start command detected.")
    }
  }

  if (strategy === "dockerfile") {
    runtime = runtime ?? "dockerfile"
    framework = framework ?? null
  }

  const { suggestedType, typeConfidence } = inferServiceType({
    startCommand,
    runtime,
    framework,
    dockerfilePath,
    sourcePath: appRootAbs,
  })

  return finalize({
    analysisId,
    fingerprint: fingerprintAnalysis({
      repoUrl: "",
      branch: "",
      rootDirectory: selectedRoot,
      dockerfilePath,
    }),
    strategy,
    dockerfilePath,
    applicationRoot: selectedRoot,
    runtime,
    framework,
    startCommand,
    buildCommand,
    suggestedName: suggestName(input.repoName, selectedRoot),
    suggestedType,
    typeConfidence,
    needsChoice: null,
    dockerfiles: allDockerfiles,
    applications,
    errors,
    clonePath: sourcePath,
  })
}

/**
 * Shallow-clone a remote repo and analyze it.
 */
export async function analyzeRemote(
  input: AnalyzeRemoteInput,
): Promise<SourceAnalysisResult> {
  const analysisId = crypto.randomUUID()
  const cloneRoot =
    input.cloneRoot ??
    process.env.DEPLOW_GIT_CLONE_ROOT ??
    path.join(process.cwd(), "data", "git-clones")
  mkdirSync(path.join(cloneRoot, "analyze"), { recursive: true })

  const git = input.gitService ?? new GitService(cloneRoot)
  const projectId = `analyze/${analysisId}`
  try {
    const clone = await git.syncRepo({
      projectId,
      repoUrl: input.repoUrl,
      branch: input.branch,
      auth: input.auth,
    })

    const repoName =
      input.repoFullName?.split("/").pop() ??
      input.repoUrl
        .replace(/\.git$/, "")
        .split("/")
        .pop() ??
      "app"

    const result = await analyzeDirectory({
      sourcePath: clone.sourcePath,
      repoName,
      rootDirectory: input.rootDirectory,
      dockerfilePath: input.dockerfilePath,
      strategyOverride: input.strategyOverride,
      railpackBin: input.railpackBin,
      runCommand: input.runCommand,
    })

    result.analysisId = analysisId
    result.fingerprint = fingerprintAnalysis({
      repoUrl: input.repoUrl,
      branch: input.branch,
      rootDirectory: result.applicationRoot,
      dockerfilePath: result.dockerfilePath,
    })
    result.clonePath = clone.sourcePath
    cacheAnalysis(result)
    return result
  } catch (error) {
    rmSync(path.join(cloneRoot, projectId), { recursive: true, force: true })
    throw error
  }
}

export function assertAnalysisFresh(input: {
  analysisId: string
  fingerprint: AnalysisFingerprint
}): SourceAnalysisResult {
  const cached = getCachedAnalysis(input.analysisId)
  if (!cached) {
    throw new Error(
      "Analysis expired—re-select the repository to analyze again.",
    )
  }
  if (!fingerprintsMatch(cached.fingerprint, input.fingerprint)) {
    throw new Error("Repository or branch changed—re-run analysis.")
  }
  return cached
}

export function toPublicAnalysis(
  result: SourceAnalysisResult,
): Omit<SourceAnalysisResult, "clonePath"> {
  const { clonePath: _, ...pub } = result
  return pub
}

// ── Railpack ────────────────────────────────────────────────────

type RailpackParsed = {
  runtime: string | null
  framework: string | null
  startCommand: string | null
  buildCommand: string | null
  error: string | null
}

async function runRailpackAnalysis(input: {
  directory: string
  railpackBin: string
  runCommand: NonNullable<AnalyzeDirectoryInput["runCommand"]>
}): Promise<RailpackParsed> {
  const tmp = mkdtempSync(path.join(tmpdir(), "deplow-rp-"))
  const infoOut = path.join(tmp, "info.json")
  const planOut = path.join(tmp, "plan.json")
  try {
    const result = await input.runCommand(
      input.railpackBin,
      [
        "prepare",
        "--info-out",
        infoOut,
        "--plan-out",
        planOut,
        "--hide-pretty-plan",
        "--error-missing-start",
        input.directory,
      ],
      undefined,
      { ...process.env, BUILDKIT_HOST: process.env.BUILDKIT_HOST ?? "" },
    )

    let info: Record<string, unknown> = {}
    let plan: Record<string, unknown> = {}
    if (existsSync(infoOut)) {
      try {
        info = JSON.parse(readFileSync(infoOut, "utf8")) as Record<
          string,
          unknown
        >
      } catch {
        // ignore
      }
    }
    if (existsSync(planOut)) {
      try {
        plan = JSON.parse(readFileSync(planOut, "utf8")) as Record<
          string,
          unknown
        >
      } catch {
        // ignore
      }
    }

    const metadata = (info.metadata ?? {}) as Record<string, string>
    const providers = Array.isArray(info.detectedProviders)
      ? (info.detectedProviders as string[])
      : typeof metadata.providers === "string"
        ? metadata.providers.split(",").map((s) => s.trim())
        : []

    const runtime =
      providers[0] ?? metadata.nodeRuntime ?? metadata.providers ?? null

    const framework =
      metadata.framework ??
      metadata.nodeFramework ??
      metadata.pythonFramework ??
      null

    const deploy = (plan.deploy ?? {}) as { startCommand?: string }
    const startCommand = deploy.startCommand?.trim() || null

    const buildCommand = extractBuildCommand(plan)

    if (result.code !== 0 && !startCommand && providers.length === 0) {
      const msg = (result.stderr || result.stdout || "").trim()
      return {
        runtime: null,
        framework: null,
        startCommand: null,
        buildCommand: null,
        error: msg.includes("start")
          ? "No start command detected."
          : msg || "Railpack could not analyze this application.",
      }
    }

    return {
      runtime,
      framework,
      startCommand,
      buildCommand,
      error: null,
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

function extractBuildCommand(plan: Record<string, unknown>): string | null {
  const steps = plan.steps as
    | Array<{ name?: string; commands?: Array<{ cmd?: string }> }>
    | undefined
  if (!Array.isArray(steps)) return null
  const build = steps.find((s) => s.name === "build" || s.name === "install")
  const cmds = build?.commands?.map((c) => c.cmd).filter(Boolean) as
    | string[]
    | undefined
  if (!cmds?.length) return null
  return cmds.join(" && ")
}

// ── inference helpers ───────────────────────────────────────────

function inferServiceType(input: {
  startCommand: string | null
  runtime: string | null
  framework: string | null
  dockerfilePath: string | null
  sourcePath: string
}): { suggestedType: "web" | "worker"; typeConfidence: "high" | "low" } {
  const cmd = (input.startCommand ?? "").toLowerCase()
  const workerHints =
    /\b(worker|sidekiq|celery|rq\b|bullmq|queue|cron|beat|consumer|subscriber)\b/
  if (workerHints.test(cmd)) {
    return { suggestedType: "worker", typeConfidence: "high" }
  }

  if (input.dockerfilePath) {
    const abs = path.isAbsolute(input.dockerfilePath)
      ? input.dockerfilePath
      : path.join(
          input.sourcePath,
          path.basename(input.dockerfilePath) === input.dockerfilePath
            ? input.dockerfilePath
            : input.dockerfilePath,
        )
    // Try reading Dockerfile for EXPOSE / CMD hints
    const dfCandidates = [
      path.join(input.sourcePath, input.dockerfilePath),
      abs,
    ]
    for (const p of dfCandidates) {
      if (!existsSync(p)) continue
      try {
        const text = readFileSync(p, "utf8").toLowerCase()
        if (workerHints.test(text) && !/\bexpose\b/.test(text)) {
          return { suggestedType: "worker", typeConfidence: "low" }
        }
        if (/\bexpose\b/.test(text)) {
          return { suggestedType: "web", typeConfidence: "high" }
        }
      } catch {
        // ignore
      }
    }
  }

  const pkgPath = path.join(input.sourcePath, "package.json")
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        scripts?: Record<string, string>
      }
      const scripts = Object.entries(pkg.scripts ?? {})
        .map(([k, v]) => `${k} ${v}`)
        .join(" ")
        .toLowerCase()
      if (workerHints.test(scripts) && !/\b(start|serve|dev)\b/.test(cmd)) {
        return { suggestedType: "worker", typeConfidence: "low" }
      }
    } catch {
      // ignore
    }
  }

  if (
    input.framework ||
    cmd.includes("serve") ||
    cmd.includes("next") ||
    cmd.includes("http")
  ) {
    return { suggestedType: "web", typeConfidence: "high" }
  }

  return { suggestedType: "web", typeConfidence: "low" }
}

function suggestName(repoName: string | undefined, root: string): string {
  if (root !== ".") {
    const base = root.split("/").filter(Boolean).pop() ?? "app"
    return slugify(base)
  }
  return slugify(repoName ?? "app")
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "app"
  )
}

function normalizeRoot(root?: string | null): string {
  const r = (root ?? ".").trim().replace(/\\/g, "/") || "."
  if (r === "/" || r === "") return "."
  return r.replace(/^\.\//, "").replace(/\/$/, "") || "."
}

function resolveUnder(root: string, rel: string): string {
  const normalized = normalizeRoot(rel)
  if (normalized === ".") return root
  const resolved = path.resolve(root, normalized)
  if (!resolved.startsWith(path.resolve(root))) {
    throw new Error(`Path escapes repository root: ${rel}`)
  }
  return resolved
}

function hasManifest(dir: string): boolean {
  return MANIFEST_FILES.some((f) => existsSync(path.join(dir, f)))
}

function walk(
  root: string,
  dir: string,
  depth: number,
  visit: (abs: string, relDir: string) => void,
): void {
  if (depth > MAX_WALK_DEPTH) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  const relDir = path.relative(root, dir).replace(/\\/g, "/")
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const abs = path.join(dir, name)
    let st
    try {
      st = statSync(abs)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      visit(abs, relDir === "" ? name : `${relDir}/${name}`)
      walk(root, abs, depth + 1, visit)
    } else {
      visit(abs, relDir)
    }
  }
}

function finalize(result: SourceAnalysisResult): SourceAnalysisResult {
  return result
}

function defaultRunCommand(
  cmd: string,
  args: string[],
  cwd?: string,
  env?: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: env ?? process.env,
      shell: false,
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")))
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")))
    child.on("error", (err) => {
      resolve({ code: 1, stdout, stderr: `${stderr}\n${err.message}` })
    })
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

/** Test helper: write a minimal Railpack info/plan pair for mocks */
export function writeMockRailpackOutputs(
  dir: string,
  info: object,
  plan: object,
): { infoOut: string; planOut: string } {
  mkdirSync(dir, { recursive: true })
  const infoOut = path.join(dir, "info.json")
  const planOut = path.join(dir, "plan.json")
  writeFileSync(infoOut, JSON.stringify(info))
  writeFileSync(planOut, JSON.stringify(plan))
  return { infoOut, planOut }
}
