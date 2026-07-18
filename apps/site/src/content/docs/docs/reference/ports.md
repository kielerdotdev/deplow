---
title: Platform ports
description: Default host ports for compose-managed control-plane services.
---

The bundled compose stack maps **control-plane** services to host ports. **Apps, Postgres, and Redis run on your k3s cluster** — not as compose app containers.

| Service | Host port | Purpose |
| --- | --- | --- |
| Hostrig web (production install) | `3000` (`HOSTRIG_WEB_PORT`) | Control plane UI + API + MCP |
| Platform Redis | `56380` (dev compose; production may be internal) | BullMQ queues |
| MinIO S3 | `59000` (typical dev) | S3-compatible API |
| MinIO console | `59001` (typical dev) | Admin UI |
| BuildKit | — | Privileged build daemon (no published port) |
| ClickHouse (Observe profile) | compose profile | Event store when Observe is enabled |

App traffic reaches **Traefik on the k3s server** (usually `http://127.0.0.1:80`), not a compose proxy port. See [Domains & URLs](/docs/guides/domains/).

## Development

| Service | Port |
| --- | --- |
| Web (Vite dev, Dev Container) | `9565` |
| Docs site (Astro) | `4321` |

## Commands

```bash
pnpm infra:up       # start control-plane compose services
pnpm infra:observe  # ClickHouse + otelcol
pnpm infra:ps       # check status
pnpm infra:down     # stop platform services
```
