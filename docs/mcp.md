# MCP (Cursor / agent deploy)

Hostrig exposes a **Streamable HTTP** Model Context Protocol server so Cursor (and similar clients) can create projects and deploy from git end-to-end.

## Endpoint

```text
{DEPLOW_PUBLIC_URL}/api/mcp
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
        "Authorization": "Bearer ${env:DEPLOW_MCP_TOKEN}"
      }
    }
  }
}
```

Set `DEPLOW_MCP_TOKEN` in the environment Cursor inherits (or paste the token; prefer env interpolation).

## Happy path

Prefer the **`deploy_from_git`** tool (or the `deploy_from_git` MCP prompt):

1. Creates a project (or uses `projectId`)
2. Analyzes the repo (`source_analyze`)
3. Creates a web service and enqueues deploy
4. Polls until `publicUrl` is ready (or returns a clear error)

Atomic tools: `project_create`, `project_get`, `source_analyze`, `service_create_and_deploy`, `deployment_get`, `operation_get`, `deployment_logs`.

## Security

- Treat MCP tokens like passwords; never commit them.
- Revoke unused tokens in Settings.
- This is not a general public REST API — only the MCP tool surface.
