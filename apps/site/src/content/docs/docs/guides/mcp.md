---
title: MCP for agents
description: Connect Cursor (or similar) to Hostrig via streamable HTTP MCP.
---

Hostrig exposes a streamable HTTP MCP server at **`/api/mcp`**. Agents use the same lifecycle as the dashboard — they do not get a separate API with different semantics.

## Setup

1. Open **Settings → API & MCP**
2. Create an operator token
3. Point your MCP client at `https://<your-hostrig-host>/api/mcp` with that token

## `deploy_from_git`

Creates a project (optional), analyzes the repo, creates a **web** service, deploys, and returns a public URL when ready.

It does **not** invent Postgres, Redis, or bindings. Add data services and bind `DATABASE_URL` / `REDIS_URL` explicitly — same as a human would in the UI.

## Scope

MCP is for deploy lifecycle automation. It is not a replacement for cluster admin, DNS, or Observe configuration.
