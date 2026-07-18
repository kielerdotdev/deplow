---
title: MCP for agents
description: Connect Cursor (or similar) to Hostrig via streamable HTTP MCP.
---

Hostrig exposes a streamable HTTP MCP server at **`/api/mcp`**. Agents use the same lifecycle as the dashboard — they do not get a separate API with different semantics.

Operator PATs from **Settings → API & MCP** also work with the thin **`hostrig` CLI** (same token, same control plane).

## Setup

1. Open **Settings → API & MCP**
2. Create an operator token
3. Point your MCP client at `https://<your-hostrig-host>/api/mcp` with that token

Cursor `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "hostrig": {
      "url": "https://your-hostrig-host/api/mcp",
      "headers": {
        "Authorization": "Bearer ${env:HOSTRIG_MCP_TOKEN}"
      }
    }
  }
}
```

Or print a snippet after CLI login: `hostrig mcp print-config`.

## `deploy_from_git`

Creates a project (optional), analyzes the repo, creates a **web** service, deploys, and returns a public URL when ready.

It does **not** invent Postgres, Redis, or bindings. Add data services and bind `DATABASE_URL` / `REDIS_URL` explicitly — same as a human would in the UI.

**App + Postgres recipe:**

1. `deploy_from_git`
2. `service_add_postgres`
3. `binding_create` (consumer = web service, envKey = `DATABASE_URL`)

## Tool matrix

| Tool | Role |
| --- | --- |
| `deploy_from_git` | Happy path end-to-end web deploy |
| `project_create` / `project_get` / `project_list` / `project_destroy` | Projects |
| `source_analyze` | Detect build settings from a git URL |
| `service_create_and_deploy` | Create web/worker + deploy |
| `service_list` | List services |
| `service_add_postgres` / `service_add_redis` | Explicit data services |
| `binding_create` | Bind app → data env keys |
| `deployment_get` / `operation_get` / `deployment_logs` | Status and logs |
| `deployment_rollback` | Roll back to a prior successful image |

## Scope

MCP is for deploy lifecycle automation. It is not a replacement for cluster admin, DNS, or Observe configuration. There is no desktop app — interfaces are **Web · MCP · CLI**.
