# Philosophy

Hostrig exists for one boring truth:

**Most projects need several processes sharing a database, cache, and object storage — and that is about it.**

You should not have to:

- Spin up a hosted Postgres for every side project
- Spin up a hosted Redis for every side project
- Wire a separate S3/R2 account and IAM dance for every side project
- Manually schedule and store Postgres backups
- Run a kitchen-sink PaaS panel that pretends every stack is equally first-class

Hostrig is the opposite of that sprawl: **one project gets the opinionated stack (apps + Postgres + Redis + S3) on a machine you already control** — service-first, not a resource catalog.

## The model

```text
one project =
  multiple independently deployable services
    (web | worker | postgres | redis)
  + explicit service↔resource bindings
  + lazy project S3 (MinIO) for backups
  + durable operations (BullMQ) for deploy/provision/backup
```

Create an empty project → add the services you need → bind apps to data services → deploy. Failures keep the service record and are retryable.

## Principles (non-negotiable)

### 1. Service-first, project as container

A project is a container. Services are the primary durable operational units (apps and data). Postgres and Redis share the same service identity and lifecycle as web/worker processes, with specialized UX where needed.

### 2. Explicit bindings, least privilege

Apps receive credentials only through explicit bindings (e.g. `DATABASE_URL` → a Postgres service). Nothing is auto-injected to every service.

### 3. Dedicated data containers per service

Each Postgres/Redis service gets its own Docker container and volume on the node. Object storage remains shared MinIO with per-project buckets provisioned lazily.

If one host is too small, add a node later (v3) or scale the box. Dedicated per-project Postgres/Redis containers keep restores and PITR scoped to one project without a multi-tenant cluster tax.

### 3. Railway-shaped DX, self-hosted

Familiar “push / build / run with env injected” feel. Not a Dokploy/Coolify clone chasing every feature. Narrow tool, thick pen.

### 4. Security is a product feature

Convenience does not outrank isolation. User apps run under a hardened runtime (gVisor by default). Secrets are encrypted at rest. The Docker socket never enters user containers. See [security.md](./security.md) and [secure-runtime.md](./secure-runtime.md).

**Priority order:** security → easy install → decent performance.

Marketing and docs must say this out loud. “Fewer tabs” is true; “just plain Docker with no sandbox story” is not.

### 5. Opinionated build and runtime

- Build: **Railpack** (default) or **Dockerfile** / prebuilt image
- Runtime: **local Docker only** (single host)
- No Compose-as-deploy, no multi-DB menu, no multi-cluster orchestration in v1

### 6. Backups are part of the loop

Postgres dumps to the platform backup bucket are on-demand and scheduled. Users should not invent cron + `pg_dump` + bucket wiring for every project.

### 7. Proxy-owned URLs, cloudflared edge (v1)

People need public app URLs without per-project DNS. **Hostrig owns the local reverse proxy** and assigns `{project}.{baseDomain}`. Domains are **app-managed** (env seeds once). v1 edge is **cloudflared** (wildcard once). Other edges (Tailscale Serve, Netbird) forward to the same Caddy origin — [access.md](./access.md), [sequencing.md](./sequencing.md).

### 8. Git push-to-deploy (v1); previews later

**Webhooks are a v1 must.** Wire a repo once; pushes ship the main track. **Preview deployments are v2** — design data-plane **slots** and hostname prefixes now so previews don’t require a rewrite ([data-plane.md](./data-plane.md)). Do not implement previews in v1.

## What we are not

- A generic “deploy anything” panel
- A hosted cloud (you bring the host)
- A Kubernetes / Swarm control plane
- A marketplace of one-click app templates
- A replacement for Cloudflare (we integrate cloudflared as an edge)
- A place that soft-pedals security to sound friendlier than the runtime we ship

## Dictating rule

If a feature, landing-page line, or docs page makes Hostrig look like “optional services + insecure default Docker,” it is wrong. Fix the surface to match this philosophy.
