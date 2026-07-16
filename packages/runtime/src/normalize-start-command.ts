/**
 * Rewrite package "dev" start scripts into production commands for containers.
 * Railpack often picks `npm start` / `bun run start` even when that script is `astro dev`.
 * It also emits `caddy run …` for static sites — passing that as `--start-cmd` makes
 * Railpack skip installing Caddy while still trying to exec it.
 */

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

type Scripts = Record<string, string>

export function isRailpackCaddyCommand(
  command: string | null | undefined,
): boolean {
  if (!command) return false
  return /\bcaddy\s+run\b/i.test(command) && /caddyfile/i.test(command)
}

export function normalizeProductionStartCommand(
  startCommand: string | null | undefined,
  sourcePath?: string | null,
): string | null {
  const scripts = readPackageScripts(sourcePath)
  const raw = startCommand?.trim() || null

  // Railpack static default: prefer a real app preview, else drop so Railpack
  // keeps its built-in Caddy in the image (do not pass as --start-cmd).
  if (raw && isRailpackCaddyCommand(raw)) {
    return productionCommandForStaticSite(scripts)
  }

  // Even with no explicit start, package.json "start" may be a dev server.
  if (!raw) {
    if (scripts.start && isDevServerCommand(scripts.start.trim())) {
      return productionCommandForLeaf(scripts.start.trim(), scripts)
    }
    return null
  }

  const leaf = resolveLeafCommand(raw, scripts)
  if (!isDevServerCommand(leaf)) return raw
  return productionCommandForLeaf(leaf, scripts) ?? raw
}

/**
 * Ensure frameworks that need a compile step get a build command.
 * Railpack often reports install-only commands (e.g. `npm ci`) as "build";
 * without a real compile, `next start` fails looking for `.next`.
 */
export function resolveProductionBuildCommand(
  buildCommand: string | null | undefined,
  sourcePath?: string | null,
  startCommand?: string | null,
): string | null {
  const raw = buildCommand?.trim() || null
  if (!sourcePath) return raw

  const scripts = readPackageScripts(sourcePath)
  const leaf = resolveLeafCommand(
    startCommand?.trim() || scripts.start || "",
    scripts,
  )
  const needsCompile =
    looksLikeNext(leaf, scripts) ||
    looksLikeAstro(leaf, scripts) ||
    looksLikeVite(leaf, scripts) ||
    Boolean(scripts.build?.trim())

  const inferred = (() => {
    if (!needsCompile) return null
    if (scripts.build?.trim()) return packageManagerRun(sourcePath, "build")
    if (looksLikeNext(leaf, scripts)) return "next build"
    if (looksLikeAstro(leaf, scripts)) return "astro build"
    if (looksLikeVite(leaf, scripts)) return "vite build"
    return null
  })()

  if (raw && !isInstallOnlyBuildCommand(raw)) return raw
  if (inferred) return inferred
  return raw
}

function isCompileBuildCommand(command: string): boolean {
  const c = command.toLowerCase()
  return (
    /\b(next|astro|vite|nuxt|remix)\s+build\b/.test(c) ||
    /\b(?:npm|pnpm|yarn|bun)(?:\s+run)?\s+build\b/.test(c)
  )
}

/** Railpack sometimes surfaces install/cache prep as the build command. */
function isInstallOnlyBuildCommand(command: string): boolean {
  if (isCompileBuildCommand(command)) return false
  const c = command.toLowerCase()
  return (
    /\bnpm\s+(ci|install)\b/.test(c) ||
    /\byarn(?:\s+install)?(?:\s|$)/.test(c) ||
    /\bpnpm\s+i(nstall)?\b/.test(c) ||
    /\bbun\s+install\b/.test(c)
  )
}

function packageManagerRun(sourcePath: string, script: string): string {
  if (existsSync(path.join(sourcePath, "pnpm-lock.yaml"))) {
    return `pnpm run ${script}`
  }
  if (existsSync(path.join(sourcePath, "yarn.lock"))) {
    return `yarn ${script}`
  }
  if (
    existsSync(path.join(sourcePath, "bun.lock")) ||
    existsSync(path.join(sourcePath, "bun.lockb"))
  ) {
    return `bun run ${script}`
  }
  return `npm run ${script}`
}

/** Preview/serve command for static sites when Railpack suggested Caddy. */
function productionCommandForStaticSite(scripts: Scripts): string | null {
  if (scripts.preview?.trim()) {
    return withHostPort(scripts.preview.trim())
  }
  if (looksLikeAstro("", scripts)) {
    return "astro preview --host 0.0.0.0 --port ${PORT}"
  }
  if (looksLikeNext("", scripts)) {
    return "next start --hostname 0.0.0.0 --port ${PORT}"
  }
  if (looksLikeVite("", scripts)) {
    return "vite preview --host 0.0.0.0 --port ${PORT}"
  }
  // No app-level server — omit start-cmd so Railpack embeds Caddy itself.
  return null
}

function productionCommandForLeaf(
  leaf: string,
  scripts: Scripts,
): string | null {
  if (looksLikeAstro(leaf, scripts)) {
    return "astro preview --host 0.0.0.0 --port ${PORT}"
  }
  if (looksLikeNext(leaf, scripts)) {
    return "next start --hostname 0.0.0.0 --port ${PORT}"
  }
  if (looksLikeVite(leaf, scripts)) {
    return "vite preview --host 0.0.0.0 --port ${PORT}"
  }
  if (scripts.preview?.trim()) {
    return withHostPort(scripts.preview.trim())
  }
  return null
}

function readPackageScripts(sourcePath?: string | null): Scripts {
  if (!sourcePath) return {}
  const pkgPath = path.join(sourcePath, "package.json")
  if (!existsSync(pkgPath)) return {}
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      scripts?: Scripts
    }
    return pkg.scripts ?? {}
  } catch {
    return {}
  }
}

/** Resolve `npm start` / `bun run start` to the underlying script body when possible. */
function resolveLeafCommand(command: string, scripts: Scripts): string {
  const trimmed = command.trim()
  const runMatch = trimmed.match(
    /^(?:npm(?:\s+run)?|bun(?:\s+run)?|yarn(?:\s+run)?|pnpm(?:\s+run)?)\s+(\S+)(?:\s|$)/i,
  )
  if (runMatch) {
    const scriptName = runMatch[1]!
    if (scriptName === "start" || scripts[scriptName]) {
      return (scripts[scriptName] ?? trimmed).trim()
    }
  }
  if (/^npm\s+start\b/i.test(trimmed) && scripts.start) {
    return scripts.start.trim()
  }
  return trimmed
}

export function isDevServerCommand(command: string): boolean {
  const c = command.toLowerCase()
  return (
    /\b(astro|next|nuxt|remix|vite)\s+dev\b/.test(c) ||
    (/\bvite(?:\s+--|\s*$)/.test(c) && !/\bpreview\b/.test(c)) ||
    /\b(react-scripts|craco)\s+start\b/.test(c) ||
    /\bnpm\s+run\s+dev\b/.test(c) ||
    /\bbun\s+run\s+dev\b/.test(c) ||
    /\byarn\s+(?:run\s+)?dev\b/.test(c) ||
    /\bpnpm\s+(?:run\s+)?dev\b/.test(c)
  )
}

/**
 * Parse Dockerfile CMD/ENTRYPOINT instructions into shell-ish command strings
 * (last instruction wins for `isDevOrientedDockerfile`).
 */
export function extractDockerfileCommands(dockerfileText: string): string[] {
  const cmds: string[] = []
  for (const rawLine of dockerfileText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const match = line.match(/^(CMD|ENTRYPOINT)\s+(.+)$/i)
    if (!match) continue
    const rest = match[2]!.trim()
    if (rest.startsWith("[")) {
      try {
        const parsed = JSON.parse(rest) as unknown
        if (Array.isArray(parsed)) {
          cmds.push(parsed.map(String).join(" "))
          continue
        }
      } catch {
        // fall through — keep raw for heuristic matching
      }
    }
    cmds.push(rest)
  }
  return cmds
}

/**
 * True when the image's final CMD/ENTRYPOINT is a local-dev server
 * (e.g. `CMD npm run dev` / `next dev`). Those images need a writable
 * rootfs and are unsuitable for Hostrig's read-only app runtime.
 */
export function isDevOrientedDockerfile(dockerfileText: string): boolean {
  const cmds = extractDockerfileCommands(dockerfileText)
  if (!cmds.length) return false
  return isDevServerCommand(cmds[cmds.length - 1]!)
}

function looksLikeAstro(leaf: string, scripts: Scripts): boolean {
  const blob = `${leaf}\n${scripts.start ?? ""}\n${scripts.dev ?? ""}\n${scripts.preview ?? ""}`.toLowerCase()
  return /\bastro\b/.test(blob)
}

function looksLikeNext(leaf: string, scripts: Scripts): boolean {
  const blob = `${leaf}\n${scripts.start ?? ""}\n${scripts.dev ?? ""}`.toLowerCase()
  return /\bnext\b/.test(blob)
}

function looksLikeVite(leaf: string, scripts: Scripts): boolean {
  const blob = `${leaf}\n${scripts.start ?? ""}\n${scripts.dev ?? ""}\n${scripts.preview ?? ""}`.toLowerCase()
  return /\bvite\b/.test(blob) && !/\bastro\b/.test(blob)
}

function withHostPort(previewScript: string): string {
  if (/\b--host\b/.test(previewScript) || /\b--port\b/.test(previewScript)) {
    return previewScript
  }
  return `${previewScript} --host 0.0.0.0 --port \${PORT}`
}
