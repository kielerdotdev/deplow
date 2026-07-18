---
title: CLI
description: Thin hostrig CLI — same operator PATs as MCP, remote client only.
---

The **`hostrig`** CLI is a thin remote client. It talks to your control plane over `/api/rpc` with the same **MCP operator PATs** as agents. It does **not** run Docker or Kubernetes locally and there is **no desktop app**.

## Install (from monorepo)

```bash
pnpm --filter @hostrig/cli build
pnpm --filter @hostrig/cli exec hostrig help
# or: node apps/cli/dist/index.js help
```

## Login

Create a token under **Settings → API & MCP**, then:

```bash
hostrig login --url https://your-hostrig-host --token <mcp-token>
```

Config is stored at `~/.config/hostrig/config.json` (mode `0600`). Override with env:

```bash
export HOSTRIG_URL=https://your-hostrig-host
export HOSTRIG_TOKEN=…   # or HOSTRIG_MCP_TOKEN
```

## Commands (v1)

| Command | Purpose |
| --- | --- |
| `hostrig whoami` | Health + actor |
| `hostrig projects list \| get \| create` | Projects |
| `hostrig services list <projectId>` | Services |
| `hostrig status <deploymentId>` | Deployment status |
| `hostrig logs <serviceId>` | Build/runtime logs |
| `hostrig rollback <serviceId>` | Prior image |
| `hostrig mcp print-config` | Cursor MCP snippet |

Out of scope for the CLI (use the web UI): cluster create, org admin, Observe, secrets bulk edit.

## Deploy from git

Prefer MCP `deploy_from_git` or the dashboard for the full git → build → URL path. The CLI focuses on status, logs, list, and rollback for scripts and CI.
