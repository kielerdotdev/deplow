---
title: Projects & services
description: What a Hostrig project is and how services get added.
---

A **project** is a container for typed **services** on your k3s cluster (`proj-{slug}` namespace). Creating a project does **not** auto-provision databases. You add web/worker/postgres/redis services, then bind apps to data.

## What you add

| Service / resource | What you get |
| --- | --- |
| **Web** | Deployable app pod; public hostname when Domains auto-subdomains are on |
| **Worker** | Deployable app pod; **no** public Ingress (private) |
| **Postgres** | Postgres StatefulSet + volume in the project namespace |
| **Redis** | Redis Deployment + volume in the project namespace |
| **S3** | Per-project bucket on platform MinIO/R2 (lazy, for backups and app storage) |
| **Bindings** | Explicit env keys (e.g. `DATABASE_URL`) from data → app services |
| **Secrets** | Encrypted credentials + downloadable `secrets.yaml` |

## Lifecycle

1. **Create** — empty project
2. **Add services** — web/worker deploy async; postgres/redis provision async
3. **Bind** — wire `DATABASE_URL` / `REDIS_URL` into apps (least privilege)
4. **Deploy** — pull or build image, run under gVisor with injected env
5. **Operate** — logs, retries, on-demand backups, deployment history
6. **Destroy** — tear down workloads, volumes, S3 bucket, Ingress for that project

Failures keep the service record and are retryable.

## Injected environment variables

Bound apps receive **only** what you bind / provision:

```text
DATABASE_URL      # via binding to a postgres service
REDIS_URL         # via binding to a redis service
S3_ENDPOINT       # when project storage is provisioned
S3_BUCKET
S3_ACCESS_KEY
S3_SECRET_KEY
S3_REGION
```

No Hostrig SDK required — apps read standard env vars. URLs for Postgres/Redis must be reachable **from app pods** (Kubernetes DNS in the project namespace).

When Observe is enabled for a project, deploys may also inject Sentry/OTLP-related env (see [Observe](/docs/guides/observe/)).

## Public URLs (v1)

| Service | Hostname |
| --- | --- |
| Primary web | `{project}.{baseDomain}` |
| Additional web | `{project}-{service}.{baseDomain}` |
| Worker / Postgres / Redis | none via Traefik |

**Custom domains are v2.** TLS terminates at the edge (Cloudflare / NetBird / Tailscale).

## Runtime

App pods run under **gVisor** by default (`runtimeClassName: gvisor`), with hardened security options. See [Security](/docs/concepts/security/).

## Organizations

Soft multi-user: invite members as `owner` or `member`. Instance admins configure cluster, registries, and networking. There is no enterprise SSO or fine-grained RBAC matrix in v1.
