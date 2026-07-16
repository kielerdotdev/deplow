---
title: Platform ports
description: Default host ports for compose-managed platform services.
---

The bundled `docker-compose.yml` maps platform services to non-default host ports to avoid collisions. **Postgres and Redis for your apps are not in compose** — they are dedicated containers created when you add those services to a project.

| Service            | Host port | Purpose                                      |
| ------------------ | --------- | -------------------------------------------- |
| Platform Redis     | `56380`   | BullMQ queues for the control plane          |
| MinIO S3           | `59000`   | S3-compatible API (per-project buckets)      |
| MinIO console      | `59001`   | Web admin UI                                 |
| Caddy proxy        | `8088`    | Hostname → app container (HTTP; TLS at edge) |
| BuildKit           | —         | Privileged build daemon (no published port)  |

## Control plane

| Service                  | Port   |
| ------------------------ | ------ |
| Hostrig web app           | `3000` |
| Hostrig docs site (Astro) | `4321` |

## App data services

Dedicated Postgres and Redis containers publish ephemeral localhost ports for operator tools. Apps reach them over Docker DNS on the `deplow_default` network — not via the host ports above.

## Commands

```bash
pnpm infra:up    # start platform services
pnpm infra:ps    # check status
pnpm infra:down  # stop platform services
```
