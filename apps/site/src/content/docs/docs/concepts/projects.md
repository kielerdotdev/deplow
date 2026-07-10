---
title: Projects
description: What a deplow project is and what gets provisioned on create.
---

A **project** is the unit of isolation in deplow. Creating one triggers automatic provisioning across all platform services.

## One project includes

| Resource     | What you get                                                  |
| ------------ | ------------------------------------------------------------- |
| **App slot** | A deploy target on the local Docker host                      |
| **Postgres** | Dedicated database + user + password on platform Postgres     |
| **Redis**    | Isolated namespace (ACL user or key prefix) on platform Redis |
| **S3**       | Dedicated bucket + access keys on platform MinIO              |
| **Secrets**  | Encrypted credentials + downloadable `secrets.yaml`           |

## Lifecycle

1. **Create** — provision infra, encrypt credentials, optionally start backup schedule
2. **Deploy** — build or pull image, run container with injected env
3. **Operate** — view logs, run on-demand backups, inspect deployment history
4. **Destroy** — tear down Postgres DB, Redis namespace, S3 bucket, and running containers

## Secrets format

Credentials are encrypted at rest using `DEPLOW_SECRETS_KEY` (or `BETTER_AUTH_SECRET` as fallback). You can export a `secrets.yaml` for local development or CI that mirrors what the platform injects at deploy time.

## Injected environment variables

Every deploy receives:

```text
DATABASE_URL
REDIS_URL
S3_ENDPOINT
S3_BUCKET
S3_ACCESS_KEY
S3_SECRET_KEY
```

Your application reads standard env vars — no deplow SDK required.

## Runtime

The project’s app container runs on the local Docker host under **gVisor** by default, with hardened security options. See [Security](/docs/concepts/security/).
