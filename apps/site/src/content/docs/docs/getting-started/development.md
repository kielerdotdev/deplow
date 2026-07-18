---
title: Development
description: Dev Container workflow for contributing to Hostrig.
---

**Local development is Dev Container only.** Do not run `pnpm install` / `pnpm dev` on the bare host for app work — the repo assumes Docker Engine on the host and a containerized toolchain.

## Setup

1. Host needs **Docker Engine**
2. Open the repo in Cursor / VS Code → **Dev Containers: Reopen in Container**
3. Wait for start — infra, DB, and the web app come up automatically
4. Open **http://localhost:9565** (Vite dev port for `@hostrig/web`)

Details also live in [`.devcontainer/README.md`](https://github.com/kielerdotdev/hostrig/blob/main/.devcontainer/README.md) in the repository.

## Useful commands (inside the container)

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Control plane (web) |
| `pnpm site:dev` | Marketing + docs site (`:4321`) |
| `pnpm check` | Lint, format check, tests |
| `pnpm test` | Unit / integration tests |
| `pnpm typecheck` | Typecheck workspace |
| `pnpm infra:up` | Compose platform services |
| `pnpm infra:observe` | ClickHouse + otelcol (Observe profile) |
| `pnpm db:push` | Apply control-plane SQLite schema |

## Environment

Copy from root `.env.example` / `apps/web` examples as needed. Day-to-day Domains settings live in the UI; `HOSTRIG_BASE_DOMAIN` only seeds on first boot.

For Observe dogfood in dev, see [Observe](/docs/guides/observe/).

## Production install is different

VPS installs use `deploy/install.sh` / the curl installer and port **3000** by default. That path is documented in [Quick start](/docs/getting-started/quick-start/) — not this page.
