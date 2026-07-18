# MCP (Cursor / agent deploy)

Hostrig exposes a **Streamable HTTP** Model Context Protocol server so Cursor (and similar clients) can create projects and deploy from git end-to-end.

## Endpoint

```text
{HOSTRIG_PUBLIC_URL}/api/mcp
```

Auth: `Authorization: Bearer <mcp-token>`

Tokens are **operator PATs** scoped to your account (full power). Create and revoke them under **Settings** in the control plane UI. The plaintext token is shown **once**.

## Cursor config

`~/.cursor/mcp.json` (or project `.cursor/mcp.json`):

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

Set `HOSTRIG_MCP_TOKEN` in the environment Cursor inherits (or paste the token; prefer env interpolation).

## Happy path

Prefer the **`deploy_from_git`** tool (or the `deploy_from_git` MCP prompt):

1. Creates a project (or uses `projectId`)
2. Analyzes the repo (`source_analyze`)
3. Creates a web service and enqueues deploy
4. Polls until `publicUrl` is ready (or returns a clear error)

### Tool matrix

| Tool | Role |
| --- | --- |
| `deploy_from_git` | Happy path: project → analyze → web service → deploy → public URL |
| `project_create` / `project_get` / `project_list` | Projects |
| `project_destroy` | Tear down project namespace |
| `source_analyze` | Detect build settings from a git URL |
| `service_create_and_deploy` | Create web/worker and deploy |
| `service_list` | List services in a project |
| `service_add_postgres` / `service_add_redis` | Explicit data services (never auto-invented by `deploy_from_git`) |
| `binding_create` | Bind app → data env keys |
| `deployment_get` / `operation_get` / `deployment_logs` | Status and logs |
| `deployment_rollback` | Roll back to a prior successful image |

**Agent recipe for app + Postgres:** `deploy_from_git` → `service_add_postgres` → `binding_create` (same explicit steps as a human).

## CLI (same tokens)

The thin `hostrig` CLI (`apps/cli`, package `@hostrig/cli`) reuses these operator PATs against the same control plane over `/api/rpc`. Not a second product. Not a desktop app. Docs: site guide **CLI**.

## Security

- Treat MCP tokens like passwords; never commit them.
- Revoke unused tokens in Settings.
- This is not a general public REST API — MCP + thin CLI share the operator PAT surface.
