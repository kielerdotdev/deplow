---
title: Quick start
description: Install the control plane, connect k3s, set Domains, and ship a first service.
---

## 1. Install the control plane (VPS)

```bash
curl -sSL https://github.com/kielerdotdev/deplow/releases/download/install/install.sh | sudo bash
```

From a repo checkout:

```bash
sudo bash deploy/install.sh
# or: bash scripts/deploy.sh
```

The installer:

- installs Docker (if missing) + Compose
- starts BuildKit
- bundles MinIO by default (`DEPLOW_BUNDLE_MINIO=0` for external S3 only)
- generates secrets and detects a public URL
- pulls `ghcr.io/kielerdotdev/deplow` and starts the stack

Default install directory: `/opt/deplow` (`DEPLOW_HOME` to override). Control plane listens on port **3000** by default (`DEPLOW_WEB_PORT`).

Open the printed URL, create the **first user** (instance admin).

Upgrade later (preserves volumes + `.env`):

```bash
curl -sSL https://github.com/kielerdotdev/deplow/releases/download/install/install.sh | sudo bash -s update
```

Pin a release: `DEPLOW_VERSION=v1.2.3 curl -sSL …/install.sh | sudo bash`.

## 2. Connect a k3s cluster

**Settings → Cluster** (instance admin):

- **BYO** — paste a kubeconfig with rights to create namespaces, Deployments, StatefulSets, Services, Ingress, NetworkPolicy, RuntimeClass
- **Create on Hetzner** — requires `DEPLOW_HETZNER_API_TOKEN`; cloud-init installs k3s + gVisor
- **Add workers** later — Hetzner cloud-init or self-hosted join script from the same page

Confirm Traefik is detected. Install gVisor on BYO nodes (`scripts/install-gvisor-k3s.sh`). Details: [Connect a cluster](/docs/guides/cluster/).

## 3. Domains + edge

**Settings → Networking & domains** (or Domains):

1. Set **base domain** (e.g. `apps.example.com`) — not `apps.localhost` for real HTTPS
2. Protocol `https`, auto-assign subdomains on
3. Point an edge at Traefik on the k3s server (usually `http://127.0.0.1:80`):
   - **NetBird guided setup** in Networking, or
   - Cloudflare Tunnel hostname `*.apps.example.com` → that origin, or
   - Tailscale Serve on the k3s server

Primary web URL shape: `https://{project}.{baseDomain}`. Extra web services: `https://{project}-{service}.{baseDomain}`.

Details: [Domains & URLs](/docs/guides/domains/).

## 4. Container registry (git builds)

**Settings → Registries** — add GHCR, Docker Hub, GitLab, or a generic registry and mark one as the **build default**.

Git / Railpack / Dockerfile deploys **push** images here and k3s pulls them. Prebuilt public images can skip this; private pulls still need credentials. Details: [Container registries](/docs/guides/registries/).

## 5. First project

1. **Create project** (empty — nothing auto-provisions)
2. **Add a web service** — prebuilt image (e.g. a whoami image) is the fastest smoke test
3. **Deploy** — wait until running
4. Open `https://{project}.{baseDomain}` through your edge

Then add Postgres/Redis when the app needs them, create **bindings** (`DATABASE_URL` / `REDIS_URL`), and redeploy. See [Deploy an app](/docs/guides/deploy/) and [Bindings & secrets](/docs/guides/secrets/).

## Optional next steps

| Step | Where |
| --- | --- |
| GitHub / GitLab + push-to-deploy | [Git connect](/docs/guides/git/) |
| MCP for Cursor / agents | [MCP for agents](/docs/guides/mcp/) |
| Postgres backups | [Backups](/docs/guides/backups/) |
| Observe (errors / OTLP) | [Observe](/docs/guides/observe/) |
| Local contribution setup | [Development](/docs/getting-started/development/) |

## Smoke test (dev / CI)

With Docker and platform services running against a checkout:

```bash
pnpm e2e
```
