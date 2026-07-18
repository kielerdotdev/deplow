import { createClient } from "./client"
import { configPath, loadConfig, requireConfig, saveConfig } from "./config"

function print(data: unknown) {
  if (typeof data === "string") {
    process.stdout.write(`${data}\n`)
    return
  }
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
}

function die(message: string, code = 1): never {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

function usage(): string {
  return `hostrig — thin remote client for Hostrig (Web · MCP · CLI)

Usage:
  hostrig login --url <control-plane-url> --token <mcp-token>
  hostrig whoami
  hostrig projects list
  hostrig projects get <id>
  hostrig projects create <name>
  hostrig services list <projectId>
  hostrig status <deploymentId>
  hostrig logs <serviceId> [--deployment <id>]
  hostrig rollback <serviceId> [--deployment <id>]
  hostrig mcp print-config
  hostrig help

Auth: same operator PATs as MCP (Settings → API & MCP).
Env overrides: HOSTRIG_URL + HOSTRIG_TOKEN | HOSTRIG_MCP_TOKEN | DEPLOW_MCP_TOKEN
Config: ${configPath()}

Not a desktop app. Not a second control plane — talks to /api/rpc only.
`
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  return args[i + 1]
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name)
}

async function main() {
  const [, , cmd, ...rest] = process.argv

  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") {
    print(usage())
    return
  }

  if (cmd === "login") {
    const url = flag(rest, "--url")
    const token = flag(rest, "--token")
    if (!url || !token) {
      die("Usage: hostrig login --url <url> --token <mcp-token>")
    }
    const path = saveConfig({ url, token })
    const client = createClient({ url: url.replace(/\/+$/, ""), token })
    try {
      const health = await client.health()
      print({ ok: true, config: path, health })
    } catch (e) {
      die(
        `Saved config to ${path}, but health check failed: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
    return
  }

  if (cmd === "mcp" && rest[0] === "print-config") {
    const cfg = requireConfig()
    print({
      mcpServers: {
        hostrig: {
          url: `${cfg.url}/api/mcp`,
          headers: {
            Authorization: "Bearer ${env:HOSTRIG_MCP_TOKEN}",
          },
        },
      },
      note: "Set HOSTRIG_MCP_TOKEN to your operator PAT (same as hostrig login).",
    })
    return
  }

  const cfg = requireConfig()
  const client = createClient(cfg)

  if (cmd === "whoami") {
    const [health, me] = await Promise.all([
      client.health(),
      client.organizations.me().catch(() => null),
    ])
    print({ url: cfg.url, health, me })
    return
  }

  if (cmd === "projects") {
    const sub = rest[0]
    if (sub === "list") {
      print(await client.projects.list())
      return
    }
    if (sub === "get") {
      const id = rest[1]
      if (!id) die("Usage: hostrig projects get <id>")
      print(await client.projects.get({ id }))
      return
    }
    if (sub === "create") {
      const name = rest[1]
      if (!name) die("Usage: hostrig projects create <name>")
      print(await client.projects.create({ name }))
      return
    }
    die("Usage: hostrig projects list|get|create …")
  }

  if (cmd === "services") {
    if (rest[0] !== "list") die("Usage: hostrig services list <projectId>")
    const projectId = rest[1]
    if (!projectId) die("Usage: hostrig services list <projectId>")
    print(await client.services.list({ projectId }))
    return
  }

  if (cmd === "status") {
    const id = rest[0]
    if (!id) die("Usage: hostrig status <deploymentId>")
    print(await client.deployments.get({ id }))
    return
  }

  if (cmd === "logs") {
    const serviceId = rest[0]
    if (!serviceId) die("Usage: hostrig logs <serviceId> [--deployment <id>]")
    const deploymentId = flag(rest, "--deployment")
    print(
      await client.deployments.logs({
        serviceId,
        deploymentId,
      }),
    )
    return
  }

  if (cmd === "rollback") {
    const serviceId = rest[0]
    if (!serviceId)
      die("Usage: hostrig rollback <serviceId> [--deployment <id>]")
    const deploymentId = flag(rest, "--deployment")
    print(
      await client.deployments.rollback({
        serviceId,
        deploymentId,
      }),
    )
    return
  }

  if (cmd === "config") {
    if (hasFlag(rest, "--path")) {
      print(configPath())
      return
    }
    const loaded = loadConfig()
    print(
      loaded
        ? { url: loaded.url, token: `${loaded.token.slice(0, 8)}…` }
        : { configured: false },
    )
    return
  }

  die(`Unknown command: ${cmd}\n\n${usage()}`)
}

main().catch((e) => {
  die(e instanceof Error ? e.message : String(e))
})
