/**
 * Reload the platform Caddy reverse proxy after route files change.
 * Framework-agnostic — used as ProxyService.onChange.
 */

import { spawn } from "node:child_process"

export interface CaddyReloadOptions {
  /** Docker container name (default: deplow-caddy) */
  containerName?: string
  /** Path inside the container (default: /etc/caddy/Caddyfile) */
  configPath?: string
  /** Inject for tests */
  runCommand?: (
    cmd: string,
    args: string[],
  ) => Promise<{ code: number; stdout: string; stderr: string }>
}

/**
 * Run `docker exec <caddy> caddy reload --config ... --adapter caddyfile`.
 * Best-effort: logs and resolves even if Caddy is not running (dev without proxy).
 */
export async function reloadCaddyProxy(
  options: CaddyReloadOptions = {},
): Promise<{ ok: boolean; message: string }> {
  const container =
    options.containerName ??
    process.env.DEPLOW_CADDY_CONTAINER ??
    "deplow-caddy"
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

  if (result.code === 0) {
    return { ok: true, message: "caddy reloaded" }
  }

  const message = (
    result.stderr ||
    result.stdout ||
    `exit ${result.code}`
  ).trim()
  // Do not throw — deploy should succeed even if proxy is offline in local dev
  console.warn(`[deplow] caddy reload failed (${container}): ${message}`)
  return { ok: false, message }
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
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString()
    })
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString()
    })
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
    child.on("error", (err) => {
      resolve({ code: 1, stdout, stderr: err.message })
    })
  })
}
