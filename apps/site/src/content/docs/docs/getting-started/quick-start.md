---
title: Quick start
description: Install Hostrig on a VPS (pull-only) or bootstrap a local development control plane.
---

## VPS / production (recommended)

No git clone and no Node on the host — pull the published image and platform deps:

```bash
curl -sSL https://raw.githubusercontent.com/kielerdotdev/deplow/main/deploy/install.sh | bash
```

Open [http://localhost:3000](http://localhost:3000), create the first user, then configure **Domains**.

Upgrade later (preserves SQLite / Redis volumes):

```bash
curl -sSL https://raw.githubusercontent.com/kielerdotdev/deplow/main/deploy/install.sh | bash -s update
```

Pin a release: `DEPLOW_VERSION=v1.2.3 curl -sSL …/install.sh | bash`.

Default install directory: `/opt/deplow` (`DEPLOW_HOME` to override). The script starts BuildKit and prints a gVisor checklist — user app deploys require `runsc` by default.

Optional public HTTPS: set `CLOUDFLARE_TUNNEL_TOKEN` in `/opt/deplow/.env`, then:

```bash
docker compose -p deplow --project-directory /opt/deplow --profile edge up -d
```

## Development: host installer

```bash
git clone <your-repo-url> Hostrig
cd Hostrig
bash scripts/install.sh
pnpm dev
```

The installer checks Docker/Node/pnpm, starts BuildKit, installs Railpack when missing, installs/verifies gVisor (`runsc`), runs `pnpm install`, starts compose services, and applies the control-plane schema. Open [http://localhost:3000](http://localhost:3000).

If gVisor is not ready, the script exits non-zero and prints next steps — deploys require `runsc` by default (`DEPLOW_APP_RUNTIME=runc` is an unsandboxed escape hatch only).

## Development: manual path

### 1. Clone and install

```bash
git clone <your-repo-url> Hostrig
cd Hostrig
pnpm install
```

### 2. Start platform services

```bash
pnpm infra:up
```

This starts Caddy, platform Redis, and related compose services. Configure `DEPLOW_S3_*` for MinIO or R2. App Postgres/Redis are created later as project services.

### 3. Apply control-plane schema

```bash
pnpm db:push
```

The control plane uses SQLite (`packages/db/data/deplow.db` by default).

### 4. Configure environment

```bash
cp apps/web/.env.example apps/web/.env
```

Set at minimum:

- `BETTER_AUTH_SECRET` — auth signing and encryption fallback
- `BUILDKIT_HOST=docker-container://buildkit` if you use the BuildKit container

### 5. Start the control plane

```bash
pnpm dev
```

Open the dashboard at [http://localhost:3000](http://localhost:3000).

## First deploy loop

1. **Domains** — set base domain (e.g. `apps.localhost` or `apps.example.com`), enable auto subdomains. v1 URLs are platform wildcard only.
2. **Create project** → add a web service (+ postgres/redis if needed) → bind → **Deploy**.
3. Optional public HTTPS: Cloudflare Tunnel + compose `edge` profile (TLS at Cloudflare).

## Smoke test (optional)

With Docker and platform services running (dev):

```bash
pnpm e2e
```

This exercises image deploy, backup, and project destroy against the live API.

## Next steps

- [Prerequisites](/docs/getting-started/prerequisites/)
- [Create and deploy a project](/docs/guides/deploy/)
- [Configure backups](/docs/guides/backups/)
- [Environment variable reference](/docs/reference/environment/)
