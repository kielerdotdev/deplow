---
title: Prerequisites
description: Docker, gVisor, BuildKit, and (for development) Node.js requirements before running deplow.
---

## VPS / production

You only need Docker on the host. The install script pulls `ghcr.io/kielerdotdev/deplow` (control plane + Railpack + Docker CLI) and pinned platform images (Redis, Caddy). **Provide your own object storage** (MinIO or Cloudflare R2) via `DEPLOW_S3_*` — buckets are created on demand.

```bash
curl -sSL https://raw.githubusercontent.com/kielerdotdev/deplow/main/deploy/install.sh | bash
```

| Requirement             | Notes                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **Docker Engine**       | Compose v2 plugin; control plane mounts `docker.sock`                                                |
| **gVisor (`runsc`)**    | Default OCI runtime for **user apps** — [install guide](https://gvisor.dev/docs/user_guide/install/) |
| **BuildKit**            | Started by `deploy/install.sh` as the `buildkit` container                                           |

You do **not** need Node, pnpm, or Railpack on the host for production (they are in the image). Supported image architecture today: **linux/amd64**.

## Development

Prefer the host bootstrap (installs/verifies BuildKit, Railpack, and gVisor, then starts platform services):

```bash
bash scripts/install.sh
```

Or satisfy the requirements below manually.

| Requirement          | Notes                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| **Docker Engine**    | With access to `docker.sock` for the control plane                                                   |
| **gVisor (`runsc`)** | Default OCI runtime for **user apps** — [install guide](https://gvisor.dev/docs/user_guide/install/) |
| **BuildKit**         | Required for Railpack and Dockerfile builds                                                          |
| **Railpack CLI**     | On `PATH` for host `pnpm dev` — [GitHub releases](https://github.com/railwayapp/railpack/releases)   |
| **Node.js 22+**      | For the control plane                                                                                |
| **pnpm 10**          | Monorepo package manager                                                                             |

## gVisor setup

User application containers run under **gVisor** by default (`DEPLOW_APP_RUNTIME=runsc`). Platform services (Caddy, platform Redis) stay on ordinary runc. App Postgres/Redis are dedicated containers per service (also platform-managed, not gVisor). Object storage is an external MinIO or Cloudflare R2.

```bash
# Follow https://gvisor.dev/docs/user_guide/install/ then:
sudo runsc install
sudo systemctl restart docker
docker run --rm --runtime=runsc hello-world
```

Recommended: enable `userns-remap: default` in `/etc/docker/daemon.json` so container root is not host root. Full details are in the repo at `docs/secure-runtime.md`.

If `runsc` is missing and `DEPLOW_APP_RUNTIME_REQUIRED` is true (default), deploys fail with a clear error rather than silently falling back. Escape hatch: `DEPLOW_APP_RUNTIME=runc` (not sandboxed).

## BuildKit setup

Run BuildKit once (recommended: `moby/buildkit` container) — production install does this for you:

```bash
docker run --rm --privileged -d --name buildkit moby/buildkit
export BUILDKIT_HOST=docker-container://buildkit
```

Add `BUILDKIT_HOST` to your shell profile or `apps/web/.env` so Railpack builds work consistently in development.

## Railpack installation (development only)

Download the Railpack binary for your platform from the [releases page](https://github.com/railwayapp/railpack/releases) and place it on your `PATH`:

```bash
export PATH="$HOME/.local/bin:$PATH"
railpack --version
```

Optionally set `RAILPACK_BIN` if the binary lives elsewhere. Production images already include Railpack.

## Public URLs (Caddy + cloudflared)

deplow’s platform reverse proxy is **Caddy** (included in compose). **Domains are configured in the app** (Domains tab). Edges only forward to Caddy; the v1 edge is **cloudflared**.

**v1 is wildcard-only:** every web service gets a hostname under `*.{baseDomain}`. Custom domains are **v2**. **TLS terminates at Cloudflare** on the tunnel; Caddy on the host is HTTP-only (no Let’s Encrypt on Caddy in v1).

**Origins:** `http://caddy:80` (compose) · `http://127.0.0.1:8088` (host).

1. In the dashboard: set base domain (e.g. `apps.example.com`), protocol `https`, enable auto-assign subdomains.
2. Create a Cloudflare Tunnel. Public hostname `*.apps.example.com` → service `http://caddy:80` (path `/`). The compose `edge` profile runs cloudflared on the **same default network** as Caddy.
3. Point a **wildcard** DNS CNAME `*.apps.example.com` at the tunnel **once** (proxied).
4. Set `CLOUDFLARE_TUNNEL_TOKEN` and start the edge profile:

```bash
# Production (/opt/deplow):
docker compose -p deplow --project-directory /opt/deplow --profile edge up -d

# Dev (repo root):
docker compose --profile edge up -d
```

Every web service then gets `https://{slug}.{baseDomain}` (or `{project}-{service}.{baseDomain}`) without more DNS. Postgres and Redis are never exposed through the proxy.

`DEPLOW_BASE_DOMAIN` only seeds the DB on first boot. Other edges (Tailscale Serve, Netbird) forward to the same origins — see repo `docs/access.md` and `docs/gtm.md`.

## Platform services

Compose starts platform glue (not shared app databases):

- **platform Redis** — BullMQ queues
- **Caddy** — hostname → app container routing
- **BuildKit** — source/Dockerfile builds (started by install scripts)
- **web** — control plane image from GHCR (production) or `pnpm dev` (development)
- **S3 (external)** — your MinIO or Cloudflare R2 (`DEPLOW_S3_PROVIDER`); not a compose service

**Postgres and Redis for apps** are dedicated Docker containers created when you add those services to a project.

## What you do not need

- A separate hosted Postgres / Redis / S3 account per app
- Kubernetes, Swarm, or multi-host SSH setup
- A separate database for each app's control plane (SQLite is used)
- Per-project DNS records (one wildcard → cloudflared is enough)
- Custom domains or Let’s Encrypt on Caddy (v1 uses Cloudflare TLS + platform wildcard)
- Node.js on the VPS for production installs
