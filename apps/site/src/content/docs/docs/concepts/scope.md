---
title: Scope
description: What deplow ships, what it refuses, and how it differs from Coolify or Dokploy.
---

deplow is an **opinionated** self-hosted project runtime — not a generic “deploy anything” panel. If you need Compose catalogs, 300 templates, or Swarm multi-node, use Coolify or Dokploy.

## In scope (v1)

- Typed services: web, worker, postgres, redis + explicit bindings
- Railpack / Dockerfile / prebuilt image on local Docker
- User apps under **gVisor** by default
- Platform wildcard URLs via Caddy + cloudflared
- GitHub/GitLab connect + push-to-deploy
- Scheduled Postgres backups to platform MinIO
- Soft organizations: invite `owner` / `member` (no SSO / fine-grained RBAC)
- Dashboard-first ops (logs, retry, rollback, destroy)

## Out of scope

- MySQL, MongoDB, or databases beyond Postgres
- Docker Compose as a deploy path
- One-click templates / marketplace
- Custom domains and PR previews (planned **v2**)
- Multi-server / Swarm / Kubernetes (**v3** at earliest)
- SSO / enterprise RBAC matrix
- Typed CLI or general public REST API
- Metrics dashboards, browser terminals
- Slack/Discord notification hubs

## Honest wedge

| Prefer deplow when…                         | Prefer Coolify/Dokploy when…        |
| ------------------------------------------- | ----------------------------------- |
| You want Railway-shaped DX on one VPS       | You need Compose + many databases   |
| gVisor-by-default matters                   | You run multi-server fleets         |
| Fixed stack + bindings is enough            | You want a template marketplace     |

More sequencing: repo `docs/sequencing.md` and `docs/gtm.md`.
