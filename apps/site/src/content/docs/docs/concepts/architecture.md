---
title: Architecture
description: Control plane, dedicated data services, gVisor for user apps, and where business logic lives.
---

deplow splits responsibilities between a **control plane** (the web app + SQLite) and a **data plane** (dedicated Postgres/Redis containers per service, shared MinIO). User apps are sandboxed separately from platform glue.

## High-level diagram

```text
┌─────────────────────────────────────────────────────────┐
│  Control plane (@deplow/web)                            │
│  TanStack Start · oRPC · Better Auth · Drizzle/SQLite   │
│  BullMQ on platform Redis · Caddy route writer          │
└───────────────┬─────────────────────────────────────────┘
                │ docker.sock (control plane only)
                ▼
┌──────────────────────────────┐    ┌─────────────────────┐
│  User apps (web / worker)    │    │  Platform glue      │
│  runtime: gVisor (runsc)     │    │  MinIO · Caddy      │
│  hardened HostConfig         │    │  BuildKit · plat.   │
└───────────────┬──────────────┘    │  Redis (BullMQ)     │
                │ bindings          └─────────────────────┘
                ▼
┌──────────────────────────────┐
│  Data services (per project) │
│  dedicated Postgres (runc)   │
│  dedicated Redis (runc)      │
└──────────────────────────────┘
```

## Monorepo packages

| Package          | Path              | Role                               |
| ---------------- | ----------------- | ---------------------------------- |
| `@deplow/web`    | `apps/web`        | UI, oRPC API, core services        |
| `@deplow/db`     | `packages/db`     | Drizzle schema + SQLite client     |
| `@deplow/shared` | `packages/shared` | Zod contracts shared across layers |

Core business logic lives in `apps/web/src/lib/core/` and stays **framework-agnostic** — no oRPC or React imports inside core modules. oRPC handlers are thin adapters over core services and Drizzle.

## Control plane storage

Project metadata, deployments, backups, and encrypted credentials are stored in SQLite. Workload data lives in **dedicated Postgres/Redis containers** and **MinIO buckets** — not in a shared multi-tenant Postgres.

## Runtime model

- **Single Docker host** via `dockerode` and `docker.sock`
- **User apps → gVisor (`runsc`)** with CapDrop ALL, no-new-privileges, readonly rootfs, memory/CPU limits
- **Data services + platform glue → runc** (dedicated Postgres/Redis, MinIO, Caddy, BuildKit)
- **One container per app deployment** with env from **explicit bindings**
- **No Compose deploy path** — images only (prebuilt, Dockerfile build, or Railpack build)
- **`docker.sock` never mounted** into user app containers

Security stance and install details: [Security](/docs/concepts/security/) and repo `docs/secure-runtime.md`.
