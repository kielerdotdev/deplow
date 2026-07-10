---
title: Platform ports
description: Default host ports for compose-managed platform services.
---

The bundled `docker-compose.yml` maps platform services to non-default host ports to avoid collisions with local development databases.

| Service       | Host port | Purpose                                 |
| ------------- | --------- | --------------------------------------- |
| Postgres      | `55432`   | Platform Postgres for project databases |
| Redis         | `56379`   | Platform Redis for project namespaces   |
| MinIO S3      | `59000`   | S3-compatible API                       |
| MinIO console | `59001`   | Web admin UI                            |

## Control plane

| Service                  | Port   |
| ------------------------ | ------ |
| deplow web app           | `3000` |
| deplow docs site (Astro) | `4321` |

## Commands

```bash
pnpm infra:up    # start platform services
pnpm infra:ps    # check status
pnpm infra:down  # stop platform services
```
