---
title: Environment variables
description: Control plane and platform configuration reference.
---

Day-to-day Domains, registries, and cluster config live in the **UI**. Env vars bootstrap install and seed first boot.

## Control plane

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | Control-plane SQLite | `data/deplow.db` (under `packages/db`) |
| `BETTER_AUTH_SECRET` | Auth + secrets encryption fallback | Required in production |
| `DEPLOW_SECRETS_KEY` | AES-GCM key for project credentials | Falls back to auth secret |
| `DEPLOW_PUBLIC_URL` | Public control plane URL (OAuth, webhooks, MCP) | Detected / required for git |
| `DEPLOW_USE_QUEUE` | Use BullMQ for deploy/provision | `true` |
| `BUILDKIT_HOST` | BuildKit connection for builds | `docker-container://buildkit` |
| `RAILPACK_BIN` | Railpack executable | `railpack` |

## Object storage

| Variable | Purpose | Default |
| --- | --- | --- |
| `DEPLOW_S3_PROVIDER` | `minio` \| `r2` | `minio` |
| `DEPLOW_S3_ENDPOINT` | S3 API URL | required in prod if not bundled |
| `DEPLOW_S3_ACCESS_KEY` / `_SECRET` | Credentials | required |
| `DEPLOW_BACKUP_BUCKET` | Backup bucket name | `deplow-backups` |
| `DEPLOW_BACKUP_DEFAULT_INTERVAL_MS` | Scheduled backup interval | `86400000` (daily) |
| `DEPLOW_BACKUP_RETAIN` | Snapshots kept per resource | `7` |
| `DEPLOW_BACKUP_ALLOW_FAST` | Allow sub-hour schedules | unset (`1` to enable) |

Installer: `DEPLOW_BUNDLE_MINIO=1` (default) starts MinIO and fills `DEPLOW_S3_*`. Set `0` for external only.

## Secure runtime (user apps on k3s)

| Variable | Purpose | Default |
| --- | --- | --- |
| `DEPLOW_APP_RUNTIME` | `runsc` → RuntimeClass `gvisor`; `runc` omits RuntimeClass | `runsc` |
| `DEPLOW_APP_RUNTIME_REQUIRED` | Fail deploy if RuntimeClass cannot be ensured | `true` |
| `DEPLOW_APP_MEMORY_MB` | Memory request/limit for user app pods | `512` |
| `DEPLOW_APP_CPUS` | CPU request/limit for user app pods | `1` |
| `DEPLOW_APP_READONLY_ROOTFS` | `readOnlyRootFilesystem` on user app containers | `true` |

## Domains / ingress (seed once)

| Variable | Purpose | Default |
| --- | --- | --- |
| `DEPLOW_BASE_DOMAIN` | Seeds platform base domain once | empty / `apps.localhost` in some installs |
| `DEPLOW_PUBLIC_URL_PROTOCOL` | Seeds shown URL protocol once | `https` / `http` for localhost |
| `DEPLOW_TRAEFIK_ORIGIN` | Where the edge should target Traefik | `http://127.0.0.1:80` |
| `CLOUDFLARE_TUNNEL_TOKEN` | Optional cloudflared for edge profile | empty |

## Registries (seed once)

| Variable | Purpose |
| --- | --- |
| `DEPLOW_BUILD_REGISTRY` | Seeds Settings → Registries when empty |
| `DEPLOW_BUILD_REGISTRY_USERNAME` | Seed username |
| `DEPLOW_BUILD_REGISTRY_PASSWORD` / `_TOKEN` | Seed password/token |
| `DEPLOW_BUILD_REGISTRY_SERVER` | Seed login host override |

Prefer **Settings → Registries** after install.

## Git OAuth / App

Prefer **Settings → Integrations**. Env vars are the fallback.

| Variable | Purpose |
| --- | --- |
| `DEPLOW_GITHUB_APP_ID` / `_CLIENT_ID` / `_CLIENT_SECRET` / `_PRIVATE_KEY` / `_SLUG` | GitHub App |
| `DEPLOW_GITLAB_OAUTH_CLIENT_ID` / `_CLIENT_SECRET` / `_BASE_URL` | GitLab OAuth |
| `DEPLOW_GITHUB_TOKEN` / `DEPLOW_GITLAB_TOKEN` | Advanced platform PAT fallbacks |

## Cluster (Hetzner)

| Variable | Purpose |
| --- | --- |
| `DEPLOW_HETZNER_API_TOKEN` | Create/add Hetzner k3s nodes from Settings → Cluster |

## PITR (optional)

| Variable | Purpose | Default |
| --- | --- | --- |
| `DEPLOW_PITR_ENABLED` | Enable PITR APIs / UI | unset (`1` to enable) |
| `PGBACKREST_CONFIG` | Path to pgBackRest conf | required when PITR is on |
| `DEPLOW_PGBACKREST_IMAGE` | Image if host binary missing | `woblerr/pgbackrest:2.58.0-alpine` |

## Observe (optional)

| Variable | Purpose | Default |
| --- | --- | --- |
| `DEPLOW_OBSERVE_ENABLED` | Enable Observe module | `false` |
| `DEPLOW_CLICKHOUSE_URL` | ClickHouse HTTP URL | required when enabled |
| `DEPLOW_OBSERVE_DOGFOOD` | Dev auto dogfood project | on in dev when Observe on; `0` to disable |

See [Observe](/docs/guides/observe/).

## Platform Redis (BullMQ)

| Variable | Default (compose) |
| --- | --- |
| `DEPLOW_QUEUE_REDIS_URL` | compose-published Redis URL |

This is **platform** Redis for queues — not tenant Redis services.
