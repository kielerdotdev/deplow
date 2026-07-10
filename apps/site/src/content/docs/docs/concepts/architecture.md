---
title: Architecture
description: Control plane vs data plane, gVisor for user apps, and where business logic lives.
---

deplow splits responsibilities between a **control plane** (the web app) and a **data plane** (shared platform services). User apps are sandboxed separately from platform services.

## High-level diagram

```text
┌─────────────────────────────────────────────────────────┐
│  Control plane (@deplow/web)                            │
│  TanStack Start · oRPC · Better Auth · Drizzle/SQLite   │
│                                                         │
│  ProvisioningService · BuildService · BackupService     │
│  DockerNodeExecutor                                     │
└───────────────┬─────────────────────────────────────────┘
                │ docker.sock (control plane only)
                ▼
┌─────────────────────────────────────────────────────────┐
│  Per-project containers                                 │
│  runtime: gVisor (runsc) · hardened HostConfig          │
└───────────────┬─────────────────────────────────────────┘
                │ credentials injected at deploy
                ▼
┌──────────────┬──────────────────┬─────────────────────┐
│  Postgres 16 │  Redis 7         │  MinIO (S3)         │
│  (runc)      │  (runc)          │  (runc)             │
└──────────────┴──────────────────┴─────────────────────┘
```

## Monorepo packages

| Package          | Path              | Role                               |
| ---------------- | ----------------- | ---------------------------------- |
| `@deplow/web`    | `apps/web`        | UI, oRPC API, core services        |
| `@deplow/db`     | `packages/db`     | Drizzle schema + SQLite client     |
| `@deplow/shared` | `packages/shared` | Zod contracts shared across layers |

Core business logic lives in `apps/web/src/lib/core/` and stays **framework-agnostic** — no oRPC or React imports inside core modules. oRPC handlers are thin adapters over core services and Drizzle.

## Control plane storage

Project metadata, deployments, backups, and encrypted credentials are stored in SQLite. Workload data (app DB rows, Redis keys, S3 objects) lives in the platform services.

## Runtime model

- **Single Docker host** via `dockerode` and `docker.sock`
- **User apps → gVisor (`runsc`)** with CapDrop ALL, no-new-privileges, readonly rootfs, memory/CPU limits
- **Platform + builds → runc** (Postgres, Redis, MinIO, BuildKit / Railpack builds)
- **One container per deployment** with injected env vars
- **No Compose deploy path** — images only (prebuilt, Dockerfile build, or Railpack build)
- **`docker.sock` never mounted** into user app containers

Security stance and install details: repo `docs/security.md` and `docs/secure-runtime.md`.
