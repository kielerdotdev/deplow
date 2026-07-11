# deplow

Opinionated self-hosted project runtime: **one project = multiple services + linked Postgres, Redis, and S3**, built with **Railpack or Dockerfile**, run on **local Docker under gVisor**, with **public URLs via Caddy + cloudflared**, per-service **git push-to-deploy**, and scheduled Postgres backups.

Most apps only need a database, object storage, and a runtime. deplow provisions that bundle on a host you control — no spinning up hosted Postgres/Redis/S3 per project, and no hand-rolled backup cron.

**Canonical docs:** [`docs/`](./docs/) — start with [philosophy](./docs/philosophy.md), [product](./docs/product.md), and [security](./docs/security.md).

```
create project
  → pin to local Docker node
  → link a Postgres DB/user + Redis ACL + MinIO bucket
  → create a default primary web service
  → add more web services or workers as needed
  → deploy each service independently under gVisor
  → proxy web services; workers remain private
  → scheduled Postgres backups → platform S3
```

## Stack

| Layer         | Tech                                                       |
| ------------- | ---------------------------------------------------------- |
| Control plane | TanStack Start, oRPC, Better Auth, Drizzle + SQLite        |
| Data plane    | Postgres 16, Redis 7, MinIO (docker compose)               |
| Proxy / edge  | **Caddy** reverse proxy + **cloudflared** (v1 edge)        |
| Build         | **Railpack** (default) or **Dockerfile** + Docker BuildKit |
| Runtime       | **Docker** + **gVisor (`runsc`)** for user apps            |
| Tooling       | pnpm monorepo, Vite+, Oxlint, Oxfmt, Vitest                |

## Packages

| Package          | Path                                     |
| ---------------- | ---------------------------------------- |
| `@deplow/web`    | `apps/web` — UI, oRPC, core services     |
| `@deplow/db`     | `packages/db` — Drizzle schema + SQLite  |
| `@deplow/shared` | `packages/shared` — Zod contracts        |
| `@deplow/site`   | `apps/site` — marketing + Starlight docs |

Core business logic is under `apps/web/src/lib/core/` and stays framework-agnostic (no oRPC / React imports).

## Prerequisites

- Docker Engine + BuildKit (`moby/buildkit` container recommended)
- **gVisor (`runsc`)** — default runtime for user apps ([install](https://gvisor.dev/docs/user_guide/install/); see [docs/secure-runtime.md](./docs/secure-runtime.md))
- **Railpack** CLI on `PATH` ([releases](https://github.com/railwayapp/railpack/releases))
- Node.js 22+ and pnpm 10
- For public URLs: a domain + Cloudflare account (tunnel token)

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
pnpm infra:up          # Postgres, Redis, MinIO, Caddy proxy
pnpm db:push
cp .env.example apps/web/.env   # fill secrets + optional DEPLOW_BASE_DOMAIN
pnpm dev               # http://localhost:3000
pnpm e2e               # API smoke (image deploy + backup + destroy)
```

## Public URLs (Caddy + cloudflared)

deplow owns the local reverse proxy (**Caddy**). The v1 edge is **cloudflared**.

```text
Internet → cloudflared → Caddy (Host: {slug}.{baseDomain}) → user app (gVisor)
```

1. Set `DEPLOW_BASE_DOMAIN=apps.example.com` in your env.
2. Create a Cloudflare Tunnel whose origin is the Caddy service (`http://caddy:80` on the compose network, or `http://127.0.0.1:8088` from the host).
3. Point a **wildcard** DNS record `*.apps.example.com` at the tunnel **once**.
4. Start the edge profile:

```bash
export CLOUDFLARE_TUNNEL_TOKEN=...   # from Cloudflare Zero Trust
docker compose --profile edge up -d
```

Every new project gets `https://{slug}.{baseDomain}` without more DNS. Postgres and Redis are **never** exposed through the proxy.

Route files live under `infra/caddy/routes/` (written on deploy/stop/destroy). See [docs/access.md](./docs/access.md).

## Git push-to-deploy

**Git (preferred):** Dashboard → **Integrations** → create/configure **GitHub App** (manifest) or **GitLab OAuth**, then **Connect** on a project. We auto-register the push webhook and clone private repos with short-lived installation/OAuth tokens. PAT paste remains under **Advanced** only. See [docs/git-oauth.md](./docs/git-oauth.md).

Webhooks are signature-verified (`X-Hub-Signature-256` / `X-Gitlab-Token`). Push to the configured production branch clones, builds (Railpack/Dockerfile), deploys the production slot, and updates the proxy. Manual UI deploys still work.

Webhook endpoint: `POST /api/webhooks/git/{projectId}`.

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
| `DEPLOW_APP_MEMORY_MB` / `_CPUS`    | User app resource limits            | `512` / `1`                            |
| `DEPLOW_BASE_DOMAIN`                | Platform public base domain         | empty (URL features off)               |
| `DEPLOW_PUBLIC_URL_PROTOCOL`        | `https` or `http` for shown URLs    | `https`                                |
| `DEPLOW_PROXY_ROUTES_DIR`           | Caddy route snippets directory      | `infra/caddy/routes`                   |
| `CLOUDFLARE_TUNNEL_TOKEN`           | cloudflared tunnel token            | empty                                  |
| `BUILDKIT_HOST`                     | For Railpack                        | `docker-container://buildkit`          |
| `RAILPACK_BIN`                      | Railpack executable                 | `railpack`                             |
| `DEPLOW_PUBLIC_URL`                 | Control plane public URL            | OAuth callbacks + webhook base         |
| `DEPLOW_GITHUB_APP_*`               | GitHub App credentials (or UI)      | see Integrations / `docs/git-oauth.md` |
| `DEPLOW_GITLAB_OAUTH_*`             | GitLab OAuth Application            | see Integrations / `docs/git-oauth.md` |

Full template: [`.env.example`](./.env.example).

## Supported deploy modes

1. **Source (default)** — absolute path; Dockerfile if present, else Railpack
2. **Prebuilt image** — advanced path; pull/run registry image with project env injected
3. **Git webhook** — push to production branch → clone → build → deploy

Every service receives project-linked `DATABASE_URL`, `REDIS_URL`, and `S3_*` variables plus its service-specific environment. Web services receive a URL; workers run without proxy routes or published ports.

User app containers run under **gVisor** with hardened defaults (dropped caps, no-new-privileges, readonly rootfs, resource limits). Platform services (Postgres/Redis/MinIO/Caddy) stay on runc. Compose deploys, SSH/Hetzner multi-host, preview deploys, and other DBs are **out of scope**.

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
| Caddy proxy   | `8088`  |
