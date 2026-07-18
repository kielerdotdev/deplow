/**
 * Path containment helpers for build contexts and Dockerfiles.
 * Reject absolute paths and `..` escapes relative to a repository root.
 */

import path from "node:path"

/**
 * Resolve `rel` under `root`, ensuring the result stays inside root.
 * Relative-only: absolute inputs throw.
 */
export function resolveContainedPath(root: string, rel: string): string {
  const base = path.resolve(root)
  const trimmed = (rel ?? "").trim() || "."
  if (path.isAbsolute(trimmed)) {
    throw new Error(`Path must be relative to the repository: ${rel}`)
  }
  // Normalize separators; reject null bytes
  if (trimmed.includes("\0")) {
    throw new Error("Invalid path")
  }
  const resolved = path.resolve(base, trimmed)
  const relative = path.relative(base, resolved)
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Path escapes repository root: ${rel}`)
  }
  return resolved
}

/**
 * Like resolveContainedPath but allows "." as the root itself.
 */
export function resolveRootDirectorySafe(
  repoRoot: string,
  rootDirectory?: string | null,
): string {
  const root = (rootDirectory ?? ".").trim() || "."
  if (root === "." || root === "") return path.resolve(repoRoot)
  return resolveContainedPath(repoRoot, root)
}
