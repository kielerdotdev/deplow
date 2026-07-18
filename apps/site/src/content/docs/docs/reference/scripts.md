---
title: Scripts
description: pnpm workspace commands for development and operations.
---

Run these from the repository root (inside the **Dev Container** for app work).

## Host / VPS install

| Command | Description |
| --- | --- |
| `curl …/install.sh \| sudo bash` | Production control-plane install (see [Quick start](/docs/getting-started/quick-start/)) |
| `sudo bash deploy/install.sh` | Same from a checkout |
| `bash scripts/install-gvisor-k3s.sh` | Install gVisor + RuntimeClass on a k3s node (root) |
| `pnpm deploy` / `bash scripts/deploy.sh` | Deploy helpers from repo |
| `pnpm install:host` | Alias for host bootstrap script where applicable |

## Development

| Command | Description |
| --- | --- |
| `pnpm dev` | Web control plane (Dev Container: `:9565`) |
| `pnpm site:dev` | Astro docs site on `:4321` |
| `pnpm check` | Lint, format check, and tests |
| `pnpm test` | Test suite |
| `pnpm typecheck` | Typecheck all packages |

## Infrastructure

| Command | Description |
| --- | --- |
| `pnpm infra:up` | Start platform compose services |
| `pnpm infra:observe` | Start Observe profile (ClickHouse + otelcol) |
| `pnpm infra:down` | Stop platform services |
| `pnpm infra:ps` | Show compose service status |

## Database

| Command | Description |
| --- | --- |
| `pnpm db:push` | Apply control-plane schema |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Run migrations |
| `pnpm db:studio` | Open Drizzle Studio |

## Build & verify

| Command | Description |
| --- | --- |
| `pnpm build` | Build web app |
| `pnpm site:build` | Build static docs site |
| `pnpm site:deploy` | Build + deploy site to Cloudflare Workers |
| `pnpm e2e` | API smoke test |
| `pnpm e2e:observe` | Observe e2e when enabled |
| `pnpm test:observe` | Observe-focused unit/integration tests |
