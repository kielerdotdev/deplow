import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export type CliConfig = {
  url: string
  token: string
}

function configPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".config")
  return join(base, "hostrig", "config.json")
}

export function loadConfig(): CliConfig | null {
  const fromEnvUrl =
    process.env.HOSTRIG_URL ??
    process.env.HOSTRIG_PUBLIC_URL ??
    process.env.DEPLOW_PUBLIC_URL
  const fromEnvToken =
    process.env.HOSTRIG_TOKEN ??
    process.env.HOSTRIG_MCP_TOKEN ??
    process.env.DEPLOW_MCP_TOKEN
  if (fromEnvUrl && fromEnvToken) {
    return { url: stripTrailingSlash(fromEnvUrl), token: fromEnvToken }
  }

  const path = configPath()
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<CliConfig>
    if (!raw.url || !raw.token) return null
    return { url: stripTrailingSlash(raw.url), token: raw.token }
  } catch {
    return null
  }
}

export function saveConfig(config: CliConfig): string {
  const path = configPath()
  mkdirSync(dirname(path), { recursive: true })
  const normalized = {
    url: stripTrailingSlash(config.url),
    token: config.token,
  }
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, {
    mode: 0o600,
  })
  return path
}

export function requireConfig(): CliConfig {
  const cfg = loadConfig()
  if (!cfg) {
    throw new Error(
      "Not logged in. Run: hostrig login --url <control-plane-url> --token <mcp-token>\n" +
        "Or set HOSTRIG_URL and HOSTRIG_TOKEN / HOSTRIG_MCP_TOKEN / DEPLOW_MCP_TOKEN.",
    )
  }
  return cfg
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "")
}

export { configPath }
