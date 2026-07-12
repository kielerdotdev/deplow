# deplow

Opinionated self-hosted project runtime: **one project = typed services (web, worker, postgres, redis) + bindings + S3**, built with **Railpack or Dockerfile**, run on **local Docker under gVisor**, with **public URLs via Caddy + cloudflared** (platform wildcard), per-service **git push-to-deploy**, and scheduled Postgres backups.

Launch bar: [docs/gtm.md](./docs/gtm.md) — **service-first stack + gVisor + wildcard Domains + git push**, not Coolify/Dokploy catalog sprawl. Custom domains and previews are v2; multi-node is v3.

Most apps only need a database, object storage, and a runtime. deplow runs that stack on a host you control — no spinning up hosted Postgres/Redis/S3 per project, and no hand-rolled backup cron.

**Canonical docs:** [`docs/`](./docs/) — start with [philosophy](./docs/philosophy.md), [product](./docs/product.md), [gtm](./docs/gtm.md), and [security](./docs/security.md).

```
create empty project (pin local Docker node)
  → add web/worker services
  → add postgres/redis services (dedicated containers)
  → bind apps to data (DATABASE_URL / REDIS_URL)
  → deploy each app service under gVisor
  → proxy web services on *.{baseDomain}; workers remain private
  → scheduled Postgres backups → platform S3
```

## Stack

| Layer         | Tech                                                       |
| ------------- | ---------------------------------------------------------- |
| Control plane | TanStack Start, oRPC, Better Auth, Drizzle + SQLite        |
| Data plane    | Dedicated Postgres/Redis containers + operator S3 (MinIO/R2) |
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

### VPS / production

- **Docker Engine** + Compose v2 plugin
- **gVisor (`runsc`)** — default runtime for user apps ([install](https://gvisor.dev/docs/user_guide/install/); see [docs/secure-runtime.md](./docs/secure-runtime.md))
- For public HTTPS: a domain + Cloudflare account (tunnel token) — TLS at Cloudflare, not Let’s Encrypt on Caddy

BuildKit is started by the install script. Railpack ships inside the control-plane image. You do **not** need Node on the host for production.

Recommended: enable `userns-remap: default` in `/etc/docker/daemon.json` (see [docs/secure-runtime.md](./docs/secure-runtime.md)).

### Development

- Node.js 22+ and pnpm 10
- Docker Engine + BuildKit + gVisor (same as production)
- Host bootstrap: `bash scripts/install.sh` (BuildKit, Railpack on PATH, gVisor, compose infra)

## Quick start (VPS / production)

**Pull-only (recommended) — no git clone, no Node:**

```bash
curl -sSL https://raw.githubusercontent.com/kielerdotdev/deplow/main/deploy/install.sh | bash
# Open http://localhost:3000 — create user → Domains → Deploy

# Later, upgrade the control plane (preserves data volumes):
curl -sSL https://raw.githubusercontent.com/kielerdotdev/deplow/main/deploy/install.sh | bash -s update

# Pin a release tag:
# DEPLOW_VERSION=v1.2.3 curl -sSL …/install.sh | bash
```

Installs under `/opt/deplow` by default (`DEPLOW_HOME` to override). Image: `ghcr.io/kielerdotdev/deplow` (built by GitHub Actions on `main` / tags; **linux/amd64**).

**From a repo checkout** (uses in-tree `deploy/` assets, data under `deploy-data/`):

```bash
bash scripts/deploy.sh          # or: pnpm deploy
```

## Development

```bash
bash scripts/install.sh   # or: pnpm install:host
pnpm dev                 # http://localhost:3000 — create user
# Open Domains → set base domain → create project → Deploy
```

**Manual:**

```bash
pnpm install
pnpm infra:up          # platform Redis + Caddy
pnpm db:push
cp apps/web/.env.example apps/web/.env   # BETTER_AUTH_SECRET; Domains UI for base domain
pnpm dev               # http://localhost:3000
pnpm e2e               # requires pnpm infra:up && pnpm dev — service deploy + Caddy Host + backup + destroy
```

`DEPLOW_BASE_DOMAIN` only seeds Domains on first boot; day-to-day changes are in the **Domains** tab.

## Public URLs (Caddy + cloudflared)

deplow owns the local reverse proxy (**Caddy**). **Domains are configured in the app** (Domains tab), not by editing env for day-to-day changes. Edges only forward HTTP with the `Host` header intact. The v1 edge is **cloudflared**.

```text
Internet → cloudflared → Caddy (Host: {slug}.{baseDomain}) → user app (gVisor)
```

**Stable origins:** `http://caddy:80` (compose network) · `http://127.0.0.1:8088` (host).

1. Open **Domains**: set base domain (e.g. `apps.example.com`), protocol `https`, enable auto-assign subdomains.
2. Create a Cloudflare Tunnel. Public hostname:
   - Hostname: `*.apps.example.com`
   - Path: `/`
   - Service: `http://caddy:80` (cloudflared on compose profile `edge` shares Caddy’s default network)
3. Point a **wildcard** DNS CNAME `*.apps.example.com` at the tunnel **once** (proxied).
4. Start the edge profile:

```bash
# Production install (/opt/deplow):
# edit CLOUDFLARE_TUNNEL_TOKEN in /opt/deplow/.env, then:
docker compose -p deplow --project-directory /opt/deplow --profile edge up -d

# Dev (repo checkout):
export CLOUDFLARE_TUNNEL_TOKEN=...   # from Cloudflare Zero Trust
docker compose --profile edge up -d
```

Every new web service gets `https://{slug}.{baseDomain}` (primary) or `https://{project}-{service}.{baseDomain}` without more DNS. Postgres and Redis are **never** exposed through the proxy.

`DEPLOW_BASE_DOMAIN` / `DEPLOW_PUBLIC_URL_PROTOCOL` only **seed** the DB on first boot. After that, change domains in the UI.

Local check: `curl -H "Host: {slug}.{baseDomain}" http://127.0.0.1:8088/`

Hostnames are stored in `service_hostnames` (`auto` now; `custom` / `preview` later — **custom domains are v2**). Route files live in the Caddy routes volume (`infra/caddy/routes/` in monorepo/dev). See [docs/access.md](./docs/access.md) and [docs/gtm.md](./docs/gtm.md).

**TLS:** terminates at Cloudflare on the tunnel. Caddy is HTTP-only on the host — there is no Let’s Encrypt on Caddy in v1.

## Git push-to-deploy

**Git (preferred):** Dashboard → **Integrations** → create/configure **GitHub App** (manifest) or **GitLab OAuth**, then **Connect** on a project. We auto-register the push webhook and clone private repos with short-lived installation/OAuth tokens. PAT paste remains under **Advanced** only. See [docs/git-oauth.md](./docs/git-oauth.md).

**MCP (Cursor / agents):** Dashboard → **Settings** → create an MCP token, then point Cursor at `{DEPLOW_PUBLIC_URL}/api/mcp` with `Authorization: Bearer …`. Prefer the `deploy_from_git` tool for end-to-end deploys. See [docs/mcp.md](./docs/mcp.md).

Webhooks are signature-verified (`X-Hub-Signature-256` / `X-Gitlab-Token`). Push to the configured production branch clones, builds (Railpack/Dockerfile), deploys the production slot, and updates the proxy. Manual UI deploys still work.

Webhook endpoint: `POST /api/webhooks/git/{serviceId}`.

## Environment

| Variable                            | Purpose                             | Default                                |
| ----------------------------------- | ----------------------------------- | -------------------------------------- |
| `DATABASE_URL`                      | Control-plane SQLite                | `data/deplow.db` (under `packages/db`) |
| `BETTER_AUTH_SECRET`                | Auth + secrets encryption fallback  | required in prod                       |
| `DEPLOW_SECRETS_KEY`                | AES-GCM key for project credentials | falls back to auth secret              |
| `DEPLOW_POSTGRES_*`                 | Platform Postgres admin             | compose defaults                       |
| `DEPLOW_REDIS_*`                    | Platform Redis                      | compose defaults                       |
| `DEPLOW_S3_PROVIDER`                | Object store adapter (`minio` \| `r2`) | `minio`                                |
| `DEPLOW_S3_ENDPOINT` / `R2_ACCOUNT` | MinIO URL or R2 account id            | required in prod                       |
| `DEPLOW_S3_ACCESS_KEY` / `_SECRET`  | S3 credentials                        | required in prod                       |
| `DEPLOW_BACKUP_BUCKET`              | Backup bucket name                    | `deplow-backups`                       |
| `DEPLOW_BACKUP_DEFAULT_INTERVAL_MS` | Scheduled backup interval           | `86400000` (daily)                     |
| `DEPLOW_BACKUP_RETAIN`              | Snapshots kept per project          | `7`                                    |
| `DEPLOW_BACKUP_ALLOW_FAST`          | Allow sub-hour schedule intervals   | unset (`1` to enable)                  |
| `DEPLOW_PITR_ENABLED`               | Enable PITR APIs / UI               | unset (`1` to enable)                  |
| `PGBACKREST_CONFIG`                 | Path to pgBackRest conf             | unset (required when PITR is on)       |
| `DEPLOW_PGBACKREST_IMAGE`           | Docker image if host binary missing | `woblerr/pgbackrest:2.58.0-alpine`     |
| `DEPLOW_APP_RUNTIME`                | OCI runtime for user apps           | `runsc` (gVisor)                       |
| `DEPLOW_APP_RUNTIME_REQUIRED`       | Fail deploy if runtime missing      | `true`                                 |
| `DEPLOW_APP_MEMORY_MB` / `_CPUS`    | User app resource limits            | `512` / `1`                            |
| `DEPLOW_BASE_DOMAIN`                | Seeds platform base domain once     | empty / `apps.localhost` in dev        |
| `DEPLOW_PUBLIC_URL_PROTOCOL`        | Seeds shown URL protocol once       | `https` / `http` for localhost         |
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

Every app service receives bound `DATABASE_URL` / `REDIS_URL` / `S3_*` (when linked) plus its service-specific environment. Web services receive a URL; workers run without proxy routes or published ports.

User app containers run under **gVisor** with hardened defaults (dropped caps, no-new-privileges, readonly rootfs, resource limits). Platform services (Redis/Caddy) stay on runc; object storage is an external MinIO or Cloudflare R2. Compose deploys, SSH/Hetzner multi-host, preview deploys, and other DBs are **out of scope**.

## Scripts

| Command                                         | Description                                      |
| ----------------------------------------------- | ------------------------------------------------ |
| `deploy/install.sh` / `… \| bash -s update`     | VPS pull-only install / upgrade (`/opt/deplow`)  |
| `bash scripts/deploy.sh` / `pnpm deploy`        | Same installer using in-tree `deploy/` assets    |
| `bash scripts/install.sh` / `pnpm install:host` | Host bootstrap + infra (**dev**)                 |
| `pnpm dev`                                      | Web app on :3000                                 |
| `pnpm build` / `pnpm start`                     | Production build + srvx                          |
| `pnpm check` / `pnpm test` / `pnpm typecheck`   | Quality gates                                    |
| `pnpm infra:up` / `infra:down`                  | Platform containers (repo compose, no web)       |
| `pnpm db:push`                                  | Apply control-plane schema                       |
| `pnpm e2e`                                      | Docker-backed smoke                              |

## Ports (compose)

| Service        | Host    |
| -------------- | ------- |
| Control plane  | `3000`  |
| Caddy proxy    | `8088`  |
| Platform Redis | `56380` |

Postgres and Redis run as **dedicated containers per project** (ephemeral localhost ports for operator tools; Docker DNS for apps).
