---
title: Scripts
description: pnpm workspace commands for development and operations.
---

Run these from the repository root.

## Host bootstrap

| Command                               | Description                                                         |
| ------------------------------------- | ------------------------------------------------------------------- |
| `bash scripts/install.sh`             | Verify/install BuildKit, Railpack, gVisor; compose up; db push      |
| `pnpm install:host`                   | Alias for `bash scripts/install.sh`                                 |

## Development

| Command          | Description                        |
| ---------------- | ---------------------------------- |
| `pnpm dev`       | Start web control plane on `:3000` |
| `pnpm site:dev`  | Start Astro docs site on `:4321`   |
| `pnpm check`     | Lint, format check, and tests      |
| `pnpm test`      | Run test suite                     |
| `pnpm typecheck` | Typecheck all packages             |

## Infrastructure

| Command           | Description                                       |
| ----------------- | ------------------------------------------------- |
| `pnpm infra:up`   | Start MinIO, Caddy, platform Redis via compose    |
| `pnpm infra:down` | Stop platform services                            |
| `pnpm infra:ps`   | Show compose service status                       |

## Database

| Command            | Description                 |
| ------------------ | --------------------------- |
| `pnpm db:push`     | Apply control-plane schema  |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate`  | Run migrations              |
| `pnpm db:studio`   | Open Drizzle Studio         |

## Build & verify

| Command           | Description                  |
| ----------------- | ---------------------------- |
| `pnpm build`       | Build web app                                    |
| `pnpm site:build`  | Build static docs site                           |
| `pnpm site:deploy` | Build + deploy site to Cloudflare Workers        |
| `pnpm e2e`         | Docker-backed API smoke test                     |
