---
title: Quick start
description: Install dependencies, start platform services, and launch the deplow control plane.
---

Get deplow running locally in a few commands.

## 1. Clone and install

```bash
git clone <your-repo-url> deplow
cd deplow
pnpm install
```

## 2. Start platform services

```bash
pnpm infra:up
```

This starts Postgres (`:55432`), Redis (`:56379`), and MinIO S3 (`:59000`) via Docker Compose.

## 3. Apply control-plane schema

```bash
pnpm db:push
```

The control plane uses SQLite (`packages/db/data/deplow.db` by default).

## 4. Configure environment

```bash
cp apps/web/.env.example apps/web/.env
```

Set at minimum:

- `BETTER_AUTH_SECRET` — auth signing and encryption fallback
- Platform connection vars if you changed compose defaults (`DEPLOW_POSTGRES_*`, `DEPLOW_REDIS_*`, `DEPLOW_MINIO_*`)

For faster backup demos, optionally add:

```bash
echo 'DEPLOW_BACKUP_DEFAULT_INTERVAL_MS=10000' >> apps/web/.env
```

## 5. Start the control plane

```bash
pnpm dev
```

Open the dashboard at [http://localhost:3000](http://localhost:3000).

## 6. Smoke test (optional)

With Docker and platform services running:

```bash
pnpm e2e
```

This exercises image deploy, backup, and project destroy against the live API.

## Next steps

- [Create and deploy a project](/docs/guides/deploy/)
- [Configure backups](/docs/guides/backups/)
- [Environment variable reference](/docs/reference/environment/)
