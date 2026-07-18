/**
 * Single place that picks which Railpack binary to spawn.
 * Only call when actually running railpack — never at module import.
 */

import { accessSync, constants } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

function exists(file: string): boolean {
  try {
    accessSync(file, constants.F_OK | constants.X_OK)
    return true
  } catch {
    return false
  }
}

function onPath(cmd: string, pathEnv = process.env.PATH): string | null {
  for (const dir of (pathEnv ?? "").split(path.delimiter)) {
    if (!dir) continue
    const full = path.join(dir, cmd)
    if (exists(full)) return full
  }
  return null
}

/** Repo-local tools bin (checked in for devcontainer bootstrap). */
function repoToolsBin(): string {
  // apps/web/src/lib/core → repo root is 5 levels up
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, "../../../../../.tools/bin/railpack")
}

/**
 * Resolve Railpack for spawn().
 * Skips broken RAILPACK_BIN; searches PATH and known install locations.
 */
export function resolveRailpackBin(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.RAILPACK_BIN?.trim()
  if (fromEnv && exists(fromEnv)) return fromEnv

  const fromPath = onPath("railpack", env.PATH)
  if (fromPath) return fromPath

  for (const candidate of [
    "/usr/local/bin/railpack",
    path.join(homedir(), ".local", "bin", "railpack"),
    repoToolsBin(),
  ]) {
    if (exists(candidate)) return candidate
  }

  throw new Error(
    "Railpack CLI not found. Rebuild the Dev Container or run: bash scripts/ensure-railpack.sh",
  )
}
