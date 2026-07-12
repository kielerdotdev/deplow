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

function isDevServerCommand(command: string): boolean {
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
