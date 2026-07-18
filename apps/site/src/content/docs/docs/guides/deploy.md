---
title: Deploy an app
description: Deploy a web or worker service from an image or git on k3s under gVisor.
---

Deploying runs a **web** or **worker** service as a Kubernetes workload. Bind postgres/redis first if the app needs those env vars.

## Prerequisites

1. [Cluster connected](/docs/guides/cluster/) with gVisor RuntimeClass
2. [Domains](/docs/guides/domains/) configured if you want a public URL
3. [Default build registry](/docs/guides/registries/) for git / Dockerfile / Railpack builds

## Via the dashboard

1. Create a project (or open an existing one)
2. Add a **web** or **worker** service (and postgres/redis if needed)
3. Create **bindings** from data → app (`DATABASE_URL`, `REDIS_URL`, …)
4. Choose a deploy path:
   - **Image** — registry reference
   - **Source / git** — connected repo or analyzed source; **Railpack** by default; Dockerfile opt-in under Advanced
5. Watch deployment logs until status is running

Public URL (v1): `https://{project}.{baseDomain}` for the primary web service when auto-subdomains are on. Workers stay private.

## Deploy inputs

| Mode | Input | Build step |
| --- | --- | --- |
| Prebuilt image | Image reference | Pull (with registry credentials if needed) |
| Dockerfile | Git/source + Dockerfile path | BuildKit build → push default registry |
| Railpack | Git/source | Railpack build → push default registry |

## Injected environment

Bound apps receive linked credentials at deploy time, for example:

```ini
DATABASE_URL=postgres://...
REDIS_URL=redis://...
S3_ENDPOINT=http://...
S3_BUCKET=my-project-bucket
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
```

Your app should read these like any twelve-factor config. Nothing is auto-injected to every service without a binding (except lazy project S3 keys when storage is provisioned).

## Runtime

User app pods use **gVisor** when `DEPLOW_APP_RUNTIME=runsc` (default). If RuntimeClass is missing and `DEPLOW_APP_RUNTIME_REQUIRED=true`, the deploy fails instead of silently using runc.

## Stopping and destroying

- **Stop** — scales/stops the app workload; data services remain
- **Destroy service / project** — tears down workloads, volumes, hostnames, and project bucket as applicable

## Git push-to-deploy

After [Git connect](/docs/guides/git/), pushes to the configured production branch clone, build, push, and roll out. Manual UI deploys still work.

## Agents

See [MCP for agents](/docs/guides/mcp/). Prefer `deploy_from_git` for end-to-end web deploys from a git URL — it does **not** create Postgres or bindings for you.
