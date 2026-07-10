---
title: Prerequisites
description: Docker, gVisor, BuildKit, Railpack, Caddy/cloudflared, and Node.js requirements before running deplow.
---

Before installing deplow, make sure your host has the following.

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

User application containers run under **gVisor** by default (`DEPLOW_APP_RUNTIME=runsc`). Platform services (Postgres, Redis, MinIO, Caddy) stay on ordinary runc.

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

deplow’s platform reverse proxy is **Caddy** (included in `docker-compose.yml`). The v1 edge is **cloudflared**.

1. Set `DEPLOW_BASE_DOMAIN=apps.example.com`.
2. Create a Cloudflare Tunnel that forwards to Caddy (`http://caddy:80` on the compose network, or host port `8088`).
3. Point a **wildcard** DNS record `*.apps.example.com` at the tunnel **once**.
4. Set `CLOUDFLARE_TUNNEL_TOKEN` and start the edge profile:

```bash
docker compose --profile edge up -d
```

Every project then gets `https://{slug}.{baseDomain}` without more DNS. Postgres and Redis are never exposed through the proxy. See repo docs `docs/access.md`.

## Platform services

deplow expects shared platform services for workloads:

- **Postgres 16** — per-project databases and users
- **Redis 7** — per-project ACL namespaces
- **MinIO** — per-project S3 buckets
- **Caddy** — hostname → app container routing

The repo ships a `docker-compose.yml` that starts these on non-default host ports so they do not collide with local dev databases.

## What you do not need

- A separate hosted Postgres / Redis / S3 account per app (the platform bundle covers that)
- Kubernetes, Swarm, or multi-host SSH setup
- A separate database for each app's control plane (SQLite is used)
- Per-project DNS records (one wildcard → cloudflared is enough)
