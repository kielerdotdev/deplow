---
title: Scope
description: What Hostrig ships, what it refuses, and how it differs from Coolify or Dokploy.
---

Hostrig is an **opinionated** self-hosted PaaS on **k3s** — not a generic “deploy anything” panel. If you need Compose catalogs, 300 templates, or Swarm multi-node, use Coolify or Dokploy.

## In scope (v1)

- Typed services: **web**, **worker**, **postgres**, **redis** + explicit bindings
- Prebuilt image **or** git → Railpack / Dockerfile → **registry** → k3s
- User apps under **gVisor** by default (RuntimeClass)
- Platform wildcard URLs via Traefik + edge (Cloudflare / NetBird / Tailscale)
- GitHub / GitLab connect + push-to-deploy
- Scheduled / on-demand Postgres (and Redis) snapshots to platform S3
- Soft organizations: invite `owner` / `member` (no SSO / fine-grained RBAC)
- Grow capacity by adding Hetzner or self-hosted **k3s workers** (no autoscaling)
- Dashboard ops (logs, retry, destroy) + **MCP** for agents
- Thin operator webhook notifications (deploy/provision failure)
- **Optional Observe** addon (Sentry-compatible + OTLP; ClickHouse)

## Out of scope (do not expect these)

- MySQL, MongoDB, or databases beyond Postgres
- Docker Compose as a deploy path
- Docker-agent / mesh remotes as the app runtime (removed; k3s only)
- One-click templates / marketplace
- Custom domains and PR previews (**planned v2**)
- MicroVMs (Kata / Firecracker)
- Autoscaling / HA control plane productization
- SSO / enterprise RBAC matrix
- Typed CLI or general public REST API keys (MCP tokens are not a public REST API)
- Browser terminals, volume browsers
- Slack / Discord / Telegram / email **notification hubs** (one HTTPS webhook is allowed)
- “Metrics dashboards as Deploy core” without enabling Observe

## Honest wedge

| Prefer Hostrig when… | Prefer Coolify/Dokploy when… |
| --- | --- |
| You want Railway-shaped DX on k3s | You need Compose + many databases |
| gVisor-by-default for user apps matters | You want a template marketplace |
| Fixed stack + bindings is enough | You need every database and addon |

## What MCP actually does

MCP is **in scope** as an operator tool surface (`/api/mcp`). Prefer `deploy_from_git` for end-to-end **web** deploys from a git URL.

It does **not**:

- auto-create Postgres / Redis
- auto-create bindings
- replace the dashboard for cluster, Domains, or registries setup

Those stay explicit — for agents and humans alike.
