---
title: Quick start
description: Bootstrap the host, start platform services, and launch the deplow control plane.
---

Get deplow running with the host installer (preferred) or the manual steps below.

## Preferred: one script

```bash
git clone <your-repo-url> deplow
cd deplow
bash scripts/install.sh
pnpm dev
```

The installer checks Docker/Node/pnpm, starts BuildKit, installs Railpack when missing, installs/verifies gVisor (`runsc`), runs `pnpm install`, starts compose services, and applies the control-plane schema. Open [http://localhost:3000](http://localhost:3000).

If gVisor is not ready, the script exits non-zero and prints next steps — deploys require `runsc` by default (`DEPLOW_APP_RUNTIME=runc` is an unsandboxed escape hatch only).

## Manual path

### 1. Clone and install

```bash
git clone <your-repo-url> deplow
cd deplow
pnpm install
```

### 2. Start platform services

```bash
pnpm infra:up
```

This starts MinIO, Caddy, platform Redis, and related compose services. App Postgres/Redis are created later as project services.

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
3. Optional public HTTPS: Cloudflare Tunnel + `docker compose --profile edge up -d` (TLS at Cloudflare).

## Smoke test (optional)

With Docker and platform services running:

```bash
pnpm e2e
```

This exercises image deploy, backup, and project destroy against the live API.

## Next steps

- [Prerequisites](/docs/getting-started/prerequisites/)
- [Create and deploy a project](/docs/guides/deploy/)
- [Configure backups](/docs/guides/backups/)
- [Environment variable reference](/docs/reference/environment/)
