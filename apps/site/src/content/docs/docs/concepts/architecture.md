---
title: Architecture
description: Control plane outside the cluster, k3s workloads, gVisor for user apps, and where business logic lives.
---

Hostrig splits responsibilities between a **control plane** (the web app + SQLite, typically outside the cluster) and a **data plane** (apps + Postgres/Redis on **k3s**). User apps are sandboxed with **gVisor**; platform and data services use the default container runtime.

## High-level diagram

```text
┌─────────────────────────────────────────────────────────┐
│  Control plane (@deplow/web)                            │
│  TanStack Start · oRPC · Better Auth · Drizzle/SQLite   │
│  BullMQ · git webhooks · MCP · optional Observe ingest  │
│  BuildKit (image builds) · platform MinIO/R2 client     │
└───────────────┬─────────────────────────────────────────┘
                │ kubeconfig / Kubernetes API
                ▼
┌─────────────────────────────────────────────────────────┐
│  k3s cluster                                            │
│  Traefik Ingress · RuntimeClass gvisor                  │
│                                                         │
│  proj-{slug}/                                           │
│    web/worker Deployments  →  runtimeClassName: gvisor  │
│    postgres StatefulSet    →  default runtime           │
│    redis Deployment        →  default runtime           │
│    NetworkPolicy + LimitRange                           │
└─────────────────────────────────────────────────────────┘
                ▲
                │ edge (Cloudflare / NetBird / Tailscale)
           TLS terminates here; Traefik is HTTP-only
```

## Monorepo packages

| Package | Path | Role |
| --- | --- | --- |
| `@deplow/web` | `apps/web` | UI, oRPC API, core services, MCP |
| `@deplow/db` | `packages/db` | Drizzle schema + SQLite client |
| `@deplow/shared` | `packages/shared` | Zod contracts shared across layers |
| `@deplow/observe` | `packages/observe` | ClickHouse schemas / query helpers (when Observe is enabled) |
| `@deplow/site` | `apps/site` | Marketing + Starlight docs |

Core business logic lives in `apps/web/src/lib/core/` and `apps/web/src/lib/k8s/` and stays **framework-agnostic** where practical. oRPC handlers are thin adapters.

## Control plane storage

Project metadata, deployments, encrypted credentials, orgs, and (when enabled) Observe metadata live in **SQLite**. Workload data lives in **project Postgres/Redis** on k3s and **platform S3 buckets** — not in a shared multi-tenant app Postgres.

## Runtime model

- **One k3s cluster** — BYO kubeconfig or managed Hetzner; grow capacity by adding workers
- **User apps → gVisor** (`runtimeClassName: gvisor`) with hardened securityContext, resource limits, NetworkPolicy
- **Data services + Traefik → default runtime** (runc/containerd)
- **Env from explicit bindings** (`DATABASE_URL` / `REDIS_URL`) plus optional project S3 keys
- **No Compose deploy path** — images only (prebuilt, Dockerfile, or Railpack)
- **No Docker-agent deploy path** — apps schedule as Kubernetes workloads only
- **Git builds require a registry** — build on the control plane, push, pull on k3s

## Optional Observe

When `DEPLOW_OBSERVE_ENABLED=1` and ClickHouse is up:

- Sentry-compatible envelope ingest
- OTLP traces / metrics / logs
- UI mode **Deploy | Observe** in the same app

Deploy does not depend on Observe. See [Observe](/docs/guides/observe/).

## Security stance

See [Security](/docs/concepts/security/). Contributor detail: repo `docs/secure-runtime.md` and `docs/security.md`.
