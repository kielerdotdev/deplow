---
title: Prerequisites
description: Docker, gVisor, BuildKit, Railpack, Caddy/cloudflared, and Node.js requirements before running deplow.
---

Prefer the host bootstrap (installs/verifies BuildKit, Railpack, and gVisor, then starts platform services):

```bash
bash scripts/install.sh
```

Or satisfy the requirements below manually.

## Required

| Requirement          | Notes                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| **Docker Engine**    | With access to `docker.sock` for the control plane                                                   |
| **gVisor (`runsc`)** | Default OCI runtime for **user apps** — [install guide](https://gvisor.dev/docs/user_guide/install/) |
| **BuildKit**         | Required for Railpack and Dockerfile builds                                                          |
| **Railpack CLI**     | On `PATH` — [GitHub releases](https://github.com/railwayapp/railpack/releases)                       |
| **Node.js 22+**      | For the control plane                                                                                |
| **pnpm 10**          | Monorepo package manager                                                                             |

## gVisor setup

User application containers run under **gVisor** by default (`DEPLOW_APP_RUNTIME=runsc`). Platform services (MinIO, Caddy, platform Redis) stay on ordinary runc. App Postgres/Redis are dedicated containers per service (also platform-managed, not gVisor).

```bash
# Follow https://gvisor.dev/docs/user_guide/install/ then:
sudo runsc install
sudo systemctl restart docker
docker run --rm --runtime=runsc hello-world
```

Recommended: enable `userns-remap: default` in `/etc/docker/daemon.json` so container root is not host root. Full details are in the repo at `docs/secure-runtime.md`.

If `runsc` is missing and `DEPLOW_APP_RUNTIME_REQUIRED` is true (default), deploys fail with a clear error rather than silently falling back. Escape hatch: `DEPLOW_APP_RUNTIME=runc` (not sandboxed).

## BuildKit setup

Run BuildKit once (recommended: `moby/buildkit` container):

```bash
docker run --rm --privileged -d --name buildkit moby/buildkit
export BUILDKIT_HOST=docker-container://buildkit
```

Add `BUILDKIT_HOST` to your shell profile or `apps/web/.env` so Railpack builds work consistently.

## Railpack installation

Download the Railpack binary for your platform from the [releases page](https://github.com/railwayapp/railpack/releases) and place it on your `PATH`:

```bash
export PATH="$HOME/.local/bin:$PATH"
railpack --version
```

Optionally set `RAILPACK_BIN` if the binary lives elsewhere.

## Public URLs (Caddy + cloudflared)

deplow’s platform reverse proxy is **Caddy** (included in `docker-compose.yml`). **Domains are configured in the app** (Domains tab). Edges only forward to Caddy; the v1 edge is **cloudflared**.

**v1 is wildcard-only:** every web service gets a hostname under `*.{baseDomain}`. Custom domains are **v2**. **TLS terminates at Cloudflare** on the tunnel; Caddy on the host is HTTP-only (no Let’s Encrypt on Caddy in v1).

**Origins:** `http://caddy:80` (compose) · `http://127.0.0.1:8088` (host).

1. In the dashboard: set base domain (e.g. `apps.example.com`), protocol `https`, enable auto-assign subdomains.
2. Create a Cloudflare Tunnel. Public hostname `*.apps.example.com` → service `http://caddy:80` (path `/`). The compose `edge` profile runs cloudflared on the **same default network** as Caddy.
3. Point a **wildcard** DNS CNAME `*.apps.example.com` at the tunnel **once** (proxied).
4. Set `CLOUDFLARE_TUNNEL_TOKEN` and start the edge profile:

```bash
docker compose --profile edge up -d
```

Every web service then gets `https://{slug}.{baseDomain}` (or `{project}-{service}.{baseDomain}`) without more DNS. Postgres and Redis are never exposed through the proxy.

`DEPLOW_BASE_DOMAIN` only seeds the DB on first boot. Other edges (Tailscale Serve, Netbird) forward to the same origins — see repo `docs/access.md` and `docs/gtm.md`.

## Platform services

Compose starts platform glue (not shared app databases):

- **platform Redis** — BullMQ queues
- **MinIO** — per-project S3 buckets
- **Caddy** — hostname → app container routing
- **BuildKit** — source/Dockerfile builds (also started by `scripts/install.sh`)

**Postgres and Redis for apps** are dedicated Docker containers created when you add those services to a project.

## What you do not need

- A separate hosted Postgres / Redis / S3 account per app
- Kubernetes, Swarm, or multi-host SSH setup
- A separate database for each app's control plane (SQLite is used)
- Per-project DNS records (one wildcard → cloudflared is enough)
- Custom domains or Let’s Encrypt on Caddy (v1 uses Cloudflare TLS + platform wildcard)
