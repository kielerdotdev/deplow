---
title: Projects
description: What a deplow project is and how services get added.
---

A **project** is a container for typed **services** on one Docker node. Creating a project pins it to the local node and starts a backup schedule; it does **not** auto-provision databases. You add web/worker/postgres/redis services, then bind apps to data.

## What you add

| Service / resource | What you get |
| ------------------ | ------------ |
| **Web / worker** | Deployable app container (Railpack, Dockerfile, or image); workers stay private |
| **Postgres** | Dedicated Postgres container + volume on the node |
| **Redis** | Dedicated Redis container + volume on the node |
| **S3** | Per-project MinIO bucket (lazy, for backups and app storage) |
| **Bindings** | Explicit env keys (e.g. `DATABASE_URL`) from data → app services |
| **Secrets** | Encrypted credentials + downloadable `secrets.yaml` |

## Lifecycle

1. **Create** — empty project, `nodeId` pin, optional backup interval
2. **Add services** — web/worker deploy async; postgres/redis provision async
3. **Bind** — wire `DATABASE_URL` / `REDIS_URL` / `S3_*` into apps
4. **Deploy** — build or pull image, run under gVisor with injected env
5. **Operate** — logs, retries, on-demand backups, deployment history
6. **Destroy** — tear down services, volumes, S3 bucket, proxy routes

## Secrets format

Credentials are encrypted at rest using `DEPLOW_SECRETS_KEY` (or `BETTER_AUTH_SECRET` as fallback). You can export a `secrets.yaml` for local development or CI that mirrors what the platform injects at deploy time.

## Injected environment variables

Bound apps receive (when linked):

```text
DATABASE_URL
REDIS_URL
S3_ENDPOINT
S3_BUCKET
S3_ACCESS_KEY
S3_SECRET_KEY
```

Your application reads standard env vars — no deplow SDK required.

## Public URLs (v1)

Primary web: `https://{project}.{baseDomain}`. Extra web services: `https://{project}-{service}.{baseDomain}`. **Custom domains are v2** — see repo `docs/gtm.md` and `docs/access.md`. TLS terminates at Cloudflare when using the tunnel edge.

## Runtime

App containers run under **gVisor** by default, with hardened security options. See [Security](/docs/concepts/security/).
