---
title: Environment variables
description: Control plane and platform configuration reference.
---

## Control plane

| Variable                            | Purpose                             | Default                                |
| ----------------------------------- | ----------------------------------- | -------------------------------------- |
| `DATABASE_URL`                      | Control-plane SQLite                | `data/deplow.db` (under `packages/db`) |
| `BETTER_AUTH_SECRET`                | Auth + secrets encryption fallback  | Required in production                 |
| `DEPLOW_SECRETS_KEY`                | AES-GCM key for project credentials | Falls back to auth secret              |
| `DEPLOW_BACKUP_BUCKET`              | Backup bucket name                  | `deplow-backups`                       |
| `DEPLOW_BACKUP_DEFAULT_INTERVAL_MS` | Scheduled backup interval           | `86400000` (daily)                     |
| `DEPLOW_BACKUP_RETAIN`              | Snapshots kept per project          | `7`                                    |
| `DEPLOW_BACKUP_ALLOW_FAST`          | Allow sub-hour schedule intervals   | unset (`1` to enable)                  |
| `DEPLOW_PITR_ENABLED`               | Enable PITR APIs / UI               | unset (`1` to enable)                  |
| `PGBACKREST_CONFIG`                 | Path to pgBackRest conf             | unset (required when PITR is on)       |
| `DEPLOW_PGBACKREST_IMAGE`           | Docker image if host binary missing | `woblerr/pgbackrest:2.58.0-alpine`     |
| `DEPLOW_POSTGRES_IMAGE`             | Dedicated Postgres container image  | `postgres:16-alpine`                   |
| `DEPLOW_REDIS_IMAGE`                | Dedicated Redis container image     | `redis:7-alpine`                       |
| `BUILDKIT_HOST`                     | BuildKit connection for builds      | `docker-container://buildkit`          |
| `RAILPACK_BIN`                      | Railpack executable                 | `railpack`                             |
| `DEPLOW_USE_QUEUE`                  | Use BullMQ for deploy/provision     | `true`                                 |

## Secure runtime (user apps)

| Variable                      | Purpose                                     | Default |
| ----------------------------- | ------------------------------------------- | ------- |
| `DEPLOW_APP_RUNTIME`          | OCI runtime name for user app containers    | `runsc` |
| `DEPLOW_APP_RUNTIME_REQUIRED` | Fail deploy if the runtime is not installed | `true`  |
| `DEPLOW_APP_MEMORY_MB`        | Memory limit for user apps                  | `512`   |
| `DEPLOW_APP_CPUS`             | CPU limit for user apps                     | `1`     |

Set `DEPLOW_APP_RUNTIME=runc` only as a temporary escape hatch. See [Security](/docs/concepts/security/).

## Domains / ingress (seed once)

Day-to-day domains live in the **Domains** tab. These env vars only seed settings on first boot:

| Variable                     | Purpose                         | Default              |
| ---------------------------- | ------------------------------- | -------------------- |
| `DEPLOW_BASE_DOMAIN`         | Seeds platform base domain once | empty / `apps.localhost` in dev |
| `DEPLOW_PUBLIC_URL_PROTOCOL` | Seeds shown URL protocol once   | `https` / `http` for localhost |
| `DEPLOW_PROXY_ROUTES_DIR`    | Caddy route snippets directory  | `infra/caddy/routes` |
| `CLOUDFLARE_TUNNEL_TOKEN`    | cloudflared tunnel token        | empty                |

See [Domains & URLs](/docs/guides/domains/).

## Git OAuth / App

Prefer configuring via **Dashboard → Integrations**. Env vars are the fallback.

| Variable                                                                            | Purpose                                               |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `DEPLOW_PUBLIC_URL`                                                                 | Public control plane URL (OAuth callbacks + webhooks) |
| `DEPLOW_GITHUB_APP_ID` / `_CLIENT_ID` / `_CLIENT_SECRET` / `_PRIVATE_KEY` / `_SLUG` | GitHub App (or create via Integrations)               |
| `DEPLOW_GITLAB_OAUTH_CLIENT_ID` / `_CLIENT_SECRET` / `_BASE_URL`                    | GitLab OAuth Application                              |
| `DEPLOW_GITHUB_TOKEN` / `DEPLOW_GITLAB_TOKEN`                                       | Advanced platform PAT fallbacks                       |

See [Git connect](/docs/guides/git/).

## Platform Redis (BullMQ)

Compose publishes **platform Redis** for the control-plane queue — not tenant Redis.

| Variable                 | Default (compose)             |
| ------------------------ | ----------------------------- |
| `DEPLOW_QUEUE_REDIS_URL` | `redis://127.0.0.1:56380`     |

## Platform MinIO

| Variable                  | Default (compose)            |
| ------------------------- | ---------------------------- |
| `DEPLOW_MINIO_ENDPOINT`   | `http://127.0.0.1:59000`     |
| `DEPLOW_MINIO_ACCESS_KEY` | (see `.env.example`)         |
| `DEPLOW_MINIO_SECRET_KEY` | (see `.env.example`)         |

## Dedicated data containers

App Postgres/Redis are **not** compose services. Images:

| Variable                | Default             |
| ----------------------- | ------------------- |
| `DEPLOW_POSTGRES_IMAGE` | `postgres:16-alpine` |
| `DEPLOW_REDIS_IMAGE`    | `redis:7-alpine`     |

See `apps/web/.env.example` in the repository for the full list and current defaults.
