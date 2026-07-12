/**
 * Reload the platform Caddy reverse proxy after route files change.
 * Framework-agnostic — used as ProxyService.onChange.
 */

import { spawn } from "node:child_process"

export interface CaddyReloadOptions {
  containerName?: string
  configPath?: string
  runCommand?: (
    cmd: string,
    args: string[],
  ) => Promise<{ code: number; stdout: string; stderr: string }>
}

export interface CaddyReloadResult {
  ok: boolean
  message: string
  at: string
}

export interface CaddyProbeResult {
  reachable: boolean
  message: string
}

let lastReload: CaddyReloadResult | null = null

/** Last reload outcome (null until the first route change attempts a reload). */
export function getLastCaddyReload(): CaddyReloadResult | null {
  return lastReload
}

/** Test helper — reset tracked reload state. */
export function resetLastCaddyReload(): void {
  lastReload = null
}

/**
 * Run `docker exec <caddy> caddy reload --config ... --adapter caddyfile`.
 * Best-effort: logs and resolves even if Caddy is not running (dev without proxy).
 */
export async function reloadCaddyProxy(
  options: CaddyReloadOptions = {},
): Promise<CaddyReloadResult> {
  const container = options.containerName ?? "deplow-caddy"
  const configPath = options.configPath ?? "/etc/caddy/Caddyfile"
  const run = options.runCommand ?? defaultRun

  const result = await run("docker", [
    "exec",
    container,
    "caddy",
    "reload",
    "--config",
    configPath,
    "--adapter",
    "caddyfile",
  ])

  const at = new Date().toISOString()
  if (result.code === 0) {
    lastReload = { ok: true, message: "caddy reloaded", at }
    return lastReload
  }

  const message = (
    result.stderr ||
    result.stdout ||
    `exit ${result.code}`
  ).trim()
  // Do not throw — deploy should succeed even if proxy is offline in local dev
  console.warn(`[deplow] caddy reload failed (${container}): ${message}`)
  lastReload = { ok: false, message, at }
  return lastReload
}

/**
 * Lightweight reachability check: `docker exec` wget against Caddy health path.
 * Root `/` returns 404 when no project Host matches — that is healthy Caddy, not down.
 */
export async function probeCaddyProxy(
  options: CaddyReloadOptions = {},
): Promise<CaddyProbeResult> {
  const container = options.containerName ?? "deplow-caddy"
  const run = options.runCommand ?? defaultRun

  const result = await run("docker", [
    "exec",
    container,
    "wget",
    "-qO-",
    "http://127.0.0.1:80/deplow-health",
  ])

  if (result.code === 0) {
    return { reachable: true, message: "caddy responding on :80" }
  }

  const message = (
    result.stderr ||
    result.stdout ||
    `exit ${result.code}`
  ).trim()
  return { reachable: false, message: message || "caddy not reachable" }
}

/** Factory suitable for ProxyService `onChange`. */
export function createCaddyReloadOnChange(
  options: CaddyReloadOptions = {},
): () => Promise<void> {
  return async () => {
    await reloadCaddyProxy(options)
  }
}

function defaultRun(
  cmd: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: process.env })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()))
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()))
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }))
    child.on("error", (err) =>
      resolve({ code: 1, stdout, stderr: err.message }),
    )
  })
}
