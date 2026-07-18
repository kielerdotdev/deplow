# Hostrig

Opinionated self-hosted project runtime: **one project = typed services (web, worker, postgres, redis) + bindings + S3**, built with **Railpack or Dockerfile**, run on **k3s under gVisor**, with **public URLs via Traefik + edge** (platform wildcard), per-service **git push-to-deploy**, and scheduled Postgres backups.

Launch bar: [docs/gtm.md](./docs/gtm.md) — **service-first stack + gVisor on k3s + wildcard Domains + git push**, not Coolify/Dokploy catalog sprawl. Custom domains and previews are v2.

Most apps only need a database, object storage, and a runtime. Hostrig runs that stack on infrastructure you control — no spinning up hosted Postgres/Redis/S3 per project, and no hand-rolled backup cron.

**Canonical docs:** [`docs/`](./docs/) — start with [philosophy](./docs/philosophy.md), [product](./docs/product.md), [gtm](./docs/gtm.md), and [security](./docs/security.md).

```
connect or create k3s cluster
  → create empty project
  → add web/worker services
  → add postgres/redis (project namespace)
  → bind apps to data (DATABASE_URL / REDIS_URL)
  → deploy each app service under gVisor RuntimeClass
  → Ingress on *.{baseDomain}; workers remain private
  → scheduled Postgres backups → platform S3
```

## Stack

| Layer         | Tech                                                       |
| ------------- | ---------------------------------------------------------- |
| Control plane | TanStack Start, oRPC, Better Auth, Drizzle + SQLite        |
| Data plane    | Postgres/Redis in-cluster + operator S3 (MinIO/R2)         |
| Proxy / edge  | **Traefik** Ingress + Cloudflare / Netbird / Tailscale     |
| Build         | **Railpack** (default) or **Dockerfile** + Docker BuildKit |
| Runtime       | **k3s** + **gVisor RuntimeClass** for user apps            |
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

- **k3s cluster** (BYO kubeconfig or managed Hetzner cloud-init)
- **gVisor (`runsc`)** on every node — managed cloud-init, Cluster UI self-hosted join script, or [`scripts/install-gvisor-k3s.sh`](./scripts/install-gvisor-k3s.sh) (see [docs/secure-runtime.md](./docs/secure-runtime.md))
- For public HTTPS: a domain + edge (Cloudflare / Netbird / Tailscale) — TLS at the edge

BuildKit is started by the install script. Railpack ships inside the control-plane image. You do **not** need Node on the host for production. Apps do **not** use Docker-agent.

### Development

- Docker Engine on the host (socket shared into the Dev Container)
- Cursor / VS Code + Dev Containers extension
- Open the repo in the Dev Container — Node, pnpm, kubectl, and helm are provided there

## Quick start (VPS / production)

**One command. That’s the install.**

```bash
curl -sSL https://github.com/kielerdotdev/deplow/releases/download/install/install.sh | sudo bash
```

Private repo / before the `install` release exists:

```bash
sudo bash deploy/install.sh
# or: gh api repos/kielerdotdev/deplow/contents/deploy/install.sh --jq .content | base64 -d | sudo bash
```

The installer:

- installs Docker (if missing) + Compose for the **control plane** stack
- starts BuildKit (builds on the CP host)
- bundles MinIO for object storage / backups
- generates secrets and detects your public URL
- pulls `ghcr.io/kielerdotdev/deplow` and starts the stack
- prints the URL — open it, create the first user, connect a **k3s** cluster (Settings → Cluster), set Domains

App sandboxing (gVisor) is installed on **cluster nodes**, not via Docker-agent.

```bash
# Upgrade later (preserves volumes + .env):
curl -sSL https://github.com/kielerdotdev/deplow/releases/download/install/install.sh | sudo bash -s update

# Private GHCR package:
#   GHCR_TOKEN=ghp_… curl -sSL …/install.sh | sudo -E bash
# Pin a release:
#   DEPLOW_VERSION=v1.2.3 curl -sSL …/install.sh | sudo bash
# External S3 (skip bundled MinIO):
#   DEPLOW_BUNDLE_MINIO=0 DEPLOW_S3_PROVIDER=r2 … curl -sSL …/install.sh | sudo -E bash
```

Installs under `/opt/deplow` (`DEPLOW_HOME` to override). Image: `ghcr.io/kielerdotdev/deplow` (**linux/amd64**, built on `main` / tags).

**From a repo checkout** (uses in-tree `deploy/` assets):

```bash
bash scripts/deploy.sh          # or: pnpm deploy
```

## Public site (hostrig.com)

Marketing + docs live in `apps/site` (Astro / Starlight) and deploy to Cloudflare Workers via Wrangler.

```bash
pnpm site:dev      # local :4321
pnpm site:build
pnpm site:deploy   # needs `wrangler login` (or CLOUDFLARE_* env)
```

GitHub Actions (`.github/workflows/site.yml`) builds on PRs and deploys on push to `main`. Add repo secrets:

| Secret                   | Where                                      |
| ------------------------ | ------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`   | Cloudflare → API Tokens → Edit Cloudflare Workers |
| `CLOUDFLARE_ACCOUNT_ID`  | Workers dashboard → Account ID             |

Attach `hostrig.com` under the Worker’s **Domains** tab after the first deploy.

## Development

**Local development is Dev Container only.** Do not run `pnpm install` / `pnpm dev` on the host for app work.

1. Host needs Docker Engine
2. Open the repo in Cursor / VS Code → **Dev Containers: Reopen in Container**
3. Wait for start — infra, DB, and the web app come up automatically
4. Open **http://localhost:9565**

Details: [`.devcontainer/README.md`](./.devcontainer/README.md).

`DEPLOW_BASE_DOMAIN` only seeds Domains on first boot; day-to-day changes are in the **Domains** tab.

Production VPS install remains `deploy/install.sh` / the curl installer above — that is not a local-dev path.

## Public URLs (Traefik + edge)

**Traefik (k3s Ingress) owns Host → Service.** Domains are configured in the app (Domains tab). Edges only forward HTTP with the `Host` header intact.

```text
Internet → Cloudflare / Netbird / Tailscale
  → Traefik on the k3s server (usually http://127.0.0.1:80)
  → Service → Pod (user apps under gVisor)
```

1. **Settings → Cluster**: connect or create k3s (Traefik detected).
2. Open **Domains**: set base domain (e.g. `apps.example.com`), protocol `https`, enable auto-assign subdomains.
3. Point an edge at Traefik on the k3s server — e.g. Cloudflare Tunnel public hostname `*.apps.example.com` → `http://127.0.0.1:80`, or use NetBird guided setup under Settings → Networking.
4. Grow capacity with **Add Hetzner worker** or **Add self-hosted worker** (Settings → Cluster).

Every new web service gets `https://{slug}.{baseDomain}` (primary) or `https://{project}-{service}.{baseDomain}` without more DNS. Postgres and Redis are **never** exposed through the proxy.

Local check (from a host that can hit Traefik):

```bash
curl -H "Host: {slug}.{baseDomain}" http://127.0.0.1:80/
```

See [docs/access.md](./docs/access.md) and [docs/gtm.md](./docs/gtm.md).

**TLS:** terminates at the edge. Traefik stays HTTP-only in-cluster for v1 — there is no Let’s Encrypt on Traefik in this ship slice.

**Honest security:** user apps run under gVisor by default; we do not claim MicroVM-grade or unbreakable isolation.

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
| `DEPLOW_APP_RUNTIME`                | `runsc` → RuntimeClass `gvisor`     | `runsc`                                |
| `DEPLOW_APP_RUNTIME_REQUIRED`       | Fail deploy if RuntimeClass missing | `true`                                 |
| `DEPLOW_APP_MEMORY_MB` / `_CPUS`    | User app pod resource limits        | `512` / `1`                            |
| `DEPLOW_BASE_DOMAIN`                | Seeds platform base domain once     | empty / `apps.localhost` in dev        |
| `DEPLOW_PUBLIC_URL_PROTOCOL`        | Seeds shown URL protocol once       | `https` / `http` for localhost         |
| `CLOUDFLARE_TUNNEL_TOKEN`           | cloudflared tunnel token (edge)     | empty                                  |
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

User app pods run under **gVisor** (`runtimeClassName: gvisor`) with hardened defaults (non-root, dropped caps, readonly rootfs, resource limits, NetworkPolicy). Postgres/Redis stay on the default runtime; object storage is an external MinIO or Cloudflare R2. Compose-as-deploy, MicroVMs as default, preview deploys, and other DBs are **out of scope**.

## Scripts

| Command                                         | Description                                      |
| ----------------------------------------------- | ------------------------------------------------ |
| `deploy/install.sh` / `… \| bash -s update`     | VPS pull-only install / upgrade (`/opt/deplow`)  |
| `bash scripts/deploy.sh` / `pnpm deploy`        | Same installer using in-tree `deploy/` assets    |
| `bash scripts/install.sh` / `pnpm install:host` | Optional host tooling (not the local-dev path)   |
| `pnpm dev`                                      | Web app on :9565 (auto-started in Dev Container) |
| `pnpm build` / `pnpm start`                     | Production build + srvx                          |
| `pnpm check` / `pnpm test` / `pnpm typecheck`   | Quality gates                                    |
| `pnpm infra:up` / `infra:down`                  | Platform containers (repo compose, no web)       |
| `pnpm db:push`                                  | Apply control-plane schema                       |
| `pnpm e2e`                                      | Docker-backed smoke                              |

## Ports (compose — control plane)

| Service        | Host    |
| -------------- | ------- |
| Control plane  | `3000`  |
| Platform Redis | `56380` |

Postgres and Redis for apps run as **Kubernetes workloads** in the project namespace.
