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
| `BUILDKIT_HOST`                     | BuildKit connection for builds      | `docker-container://buildkit`          |
| `RAILPACK_BIN`                      | Railpack executable                 | `railpack`                             |

## Secure runtime (user apps)

| Variable                      | Purpose                                      | Default  |
| ----------------------------- | -------------------------------------------- | -------- |
| `DEPLOW_APP_RUNTIME`          | OCI runtime name for user app containers     | `runsc`  |
| `DEPLOW_APP_RUNTIME_REQUIRED` | Fail deploy if the runtime is not installed  | `true`   |
| `DEPLOW_APP_MEMORY_MB`        | Memory limit for user apps                   | `512`    |
| `DEPLOW_APP_CPUS`             | CPU limit for user apps                      | `1`      |

Set `DEPLOW_APP_RUNTIME=runc` only as a temporary escape hatch. See [Security](/docs/concepts/security/).

## Platform Postgres

| Variable                   | Default (compose)    |
| -------------------------- | -------------------- |
| `DEPLOW_POSTGRES_HOST`     | `localhost`          |
| `DEPLOW_POSTGRES_PORT`     | `55432`              |
| `DEPLOW_POSTGRES_USER`     | `deplow`             |
| `DEPLOW_POSTGRES_PASSWORD` | (see `.env.example`) |
| `DEPLOW_POSTGRES_DATABASE` | `deplow`             |

## Platform Redis

| Variable                | Default (compose)    |
| ----------------------- | -------------------- |
| `DEPLOW_REDIS_HOST`     | `localhost`          |
| `DEPLOW_REDIS_PORT`     | `56379`              |
| `DEPLOW_REDIS_PASSWORD` | (see `.env.example`) |

## Platform MinIO

| Variable                  | Default (compose)        |
| ------------------------- | ------------------------ |
| `DEPLOW_MINIO_ENDPOINT`   | `http://localhost:59000` |
| `DEPLOW_MINIO_ACCESS_KEY` | (see `.env.example`)     |
| `DEPLOW_MINIO_SECRET_KEY` | (see `.env.example`)     |

See `apps/web/.env.example` in the repository for the full list and current defaults.
