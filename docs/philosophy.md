# Philosophy

deplow exists for one boring truth:

**Most apps you deploy need a database, object storage (S3 / R2-shaped), and a JS (or container) runtime — and that is about it.**

You should not have to:

- Spin up a hosted Postgres for every side project
- Spin up a hosted Redis for every side project
- Wire a separate S3/R2 account and IAM dance for every side project
- Manually schedule and store Postgres backups
- Run a kitchen-sink PaaS panel that pretends every stack is equally first-class

deplow is the opposite of that sprawl: **one project gets the whole bundle on a machine you already control.**

## The bundle

```text
one project =
  one app
  + Postgres
  + Redis
  + S3 (MinIO)
  + encrypted secrets
  + scheduled Postgres backups
```

Create a project → infra is provisioned → deploy with Railpack, a Dockerfile, or a prebuilt image → backups run without a second product.

That is the product. Everything else is noise until this loop is excellent.

## Principles (non-negotiable)

### 1. Project-first, not service-à-la-carte

You do not pick “add Redis later.” Creating a project provisions Postgres, Redis, and S3 together. Isolation is per project (DB/user, Redis ACL/namespace, bucket + keys).

### 2. Shared platform, isolated tenants — not instance multi-tenancy

**One data-plane instance of each service per node:** one Postgres, one Redis, one MinIO. (v1 = one node for the whole install.) Projects are tenants of that node’s platform (DB/user, Redis ACL/namespace, bucket + keys) — not owners of their own Postgres/Redis/MinIO processes.

Out of scope:

- Pools of named Postgres/Redis/MinIO instances with placement UI on a single node
- Per-project dedicated database/cache containers
- “Pick which Redis this project uses” on the same node

v3 may add **more nodes**, each with its own shared trio; a project still never spans nodes. See [sequencing.md](./sequencing.md) and [data-plane.md](./data-plane.md).

If one host is too small, add a node later (v3) or scale the box. Do not grow per-project DB containers. That is how we avoid the hosted-service tax without becoming Coolify.

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

People need public app URLs without per-project DNS. **deplow owns the local reverse proxy** and assigns `{project}.{baseDomain}`. v1 edge is **cloudflared** (wildcard once). More edges later — [access.md](./access.md), [sequencing.md](./sequencing.md).

### 8. Git push-to-deploy (v1); previews later

**Webhooks are a v1 must.** Wire a repo once; pushes ship the main track. **Preview deployments are v2** — design data-plane **slots** and hostname prefixes now so previews don’t require a rewrite ([data-plane.md](./data-plane.md)). Do not implement previews in v1.

## What we are not

- A generic “deploy anything” panel
- A hosted cloud (you bring the host)
- A Kubernetes / Swarm control plane
- An instance-pool manager (per-project DB containers)
- A replacement for Cloudflare (we integrate cloudflared as an edge)
- A place that soft-pedals security to sound friendlier than the runtime we ship

## Dictating rule

If a feature, landing-page line, or docs page makes deplow look like “optional services + insecure default Docker,” it is wrong. Fix the surface to match this philosophy.
