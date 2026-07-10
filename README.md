# deplow

Opinionated self-hosted project runtime: **one project = app + Postgres + Redis + S3 + secrets**, built with **Railpack or Dockerfile**, run on **local Docker under gVisor**, with **scheduled Postgres backups**.

Most apps only need a database, object storage, and a runtime. deplow provisions that bundle on a host you control — no spinning up hosted Postgres/Redis/S3 per project, and no hand-rolled backup cron.

**Canonical docs:** [`docs/`](./docs/) — start with [philosophy](./docs/philosophy.md), [product](./docs/product.md), and [security](./docs/security.md).

```
create project
  → provision Postgres DB/user
  → provision Redis ACL namespace
  → provision MinIO bucket
  → encrypt credentials + secrets.yaml
  → deploy (prebuilt image | Dockerfile | Railpack) under gVisor
  → scheduled Postgres backups → platform S3
```

## Stack

| Layer         | Tech                                                       |
| ------------- | ---------------------------------------------------------- |
| Control plane | TanStack Start, oRPC, Better Auth, Drizzle + SQLite        |
| Data plane    | Postgres 16, Redis 7, MinIO (docker compose)               |
| Build         | **Railpack** (default) or **Dockerfile** + Docker BuildKit |
| Runtime       | **Docker** + **gVisor (`runsc`)** for user apps            |
| Tooling       | pnpm monorepo, Vite+, Oxlint, Oxfmt, Vitest                |

## Packages

| Package          | Path                                    |
| ---------------- | --------------------------------------- |
| `@deplow/web`    | `apps/web` — UI, oRPC, core services    |
| `@deplow/db`     | `packages/db` — Drizzle schema + SQLite |
| `@deplow/shared` | `packages/shared` — Zod contracts       |
| `@deplow/site`   | `apps/site` — marketing + Starlight docs |

Core business logic is under `apps/web/src/lib/core/` and stays framework-agnostic (no oRPC / React imports).

## Prerequisites

- Docker Engine + BuildKit (`moby/buildkit` container recommended)
- **gVisor (`runsc`)** — default runtime for user apps ([install](https://gvisor.dev/docs/user_guide/install/); see [docs/secure-runtime.md](./docs/secure-runtime.md))
- **Railpack** CLI on `PATH` ([releases](https://github.com/railwayapp/railpack/releases))
- Node.js 22+ and pnpm 10

```bash
# BuildKit (once)
docker run --rm --privileged -d --name buildkit moby/buildkit
export BUILDKIT_HOST=docker-container://buildkit

# gVisor (once) — follow https://gvisor.dev/docs/user_guide/install/
sudo runsc install
sudo systemctl restart docker
docker run --rm --runtime=runsc hello-world

# Railpack (example)
# install binary from GitHub releases into ~/.local/bin
export PATH="$HOME/.local/bin:$PATH"
railpack --version
```

Recommended: enable `userns-remap: default` in `/etc/docker/daemon.json` (see [docs/secure-runtime.md](./docs/secure-runtime.md)).

## Quick start

```bash
pnpm install
pnpm infra:up          # Postgres :55432, Redis :56379, MinIO :59000
pnpm db:push
cp apps/web/.env.example apps/web/.env   # or use existing .env
# optional short backup interval for demos:
# echo 'DEPLOW_BACKUP_DEFAULT_INTERVAL_MS=10000' >> apps/web/.env
pnpm dev               # http://localhost:3000
pnpm e2e               # API smoke (image deploy + backup + destroy)
```

## Environment

| Variable                            | Purpose                             | Default                                |
| ----------------------------------- | ----------------------------------- | -------------------------------------- |
| `DATABASE_URL`                      | Control-plane SQLite                | `data/deplow.db` (under `packages/db`) |
| `BETTER_AUTH_SECRET`                | Auth + secrets encryption fallback  | required in prod                       |
| `DEPLOW_SECRETS_KEY`                | AES-GCM key for project credentials | falls back to auth secret              |
| `DEPLOW_POSTGRES_*`                 | Platform Postgres admin             | compose defaults                       |
| `DEPLOW_REDIS_*`                    | Platform Redis                      | compose defaults                       |
| `DEPLOW_MINIO_*`                    | Platform MinIO                      | compose defaults                       |
| `DEPLOW_BACKUP_BUCKET`              | Backup bucket name                  | `deplow-backups`                       |
| `DEPLOW_BACKUP_DEFAULT_INTERVAL_MS` | Scheduled backup interval           | `86400000` (daily)                     |
| `DEPLOW_APP_RUNTIME`                | OCI runtime for user apps           | `runsc` (gVisor)                       |
| `DEPLOW_APP_RUNTIME_REQUIRED`       | Fail deploy if runtime missing      | `true`                                 |
| `BUILDKIT_HOST`                     | For Railpack                        | `docker-container://buildkit`          |
| `RAILPACK_BIN`                      | Railpack executable                 | `railpack`                             |

## Supported deploy modes

1. **Prebuilt image** — pull/run registry image with project env injected
2. **Dockerfile** — if source tree contains `Dockerfile`, `docker build -t deplow/<slug>:<deploymentId>`
3. **Railpack** — otherwise `railpack build --name deplow/<slug>:<deploymentId> <source>`

Injected env on every deploy: `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`.

User app containers run under **gVisor** with hardened defaults (dropped caps, no-new-privileges, readonly rootfs, resource limits). Platform services (Postgres/Redis/MinIO) stay on runc. Compose deploys, SSH/Hetzner multi-host, and other DBs are **out of scope**.

## Scripts

| Command                                       | Description                |
| --------------------------------------------- | -------------------------- |
| `pnpm dev`                                    | Web app on :3000           |
| `pnpm check` / `pnpm test` / `pnpm typecheck` | Quality gates              |
| `pnpm infra:up` / `infra:down`                | Platform containers        |
| `pnpm db:push`                                | Apply control-plane schema |
| `pnpm e2e`                                    | Docker-backed smoke        |

## Ports (compose)

| Service       | Host    |
| ------------- | ------- |
| Postgres      | `55432` |
| Redis         | `56379` |
| MinIO S3      | `59000` |
| MinIO console | `59001` |
