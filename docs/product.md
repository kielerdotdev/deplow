# Product

Canonical product shape. **What to build when:** [sequencing.md](./sequencing.md). Philosophy: [philosophy.md](./philosophy.md). Data linking: [data-plane.md](./data-plane.md).

## One-line

**Opinionated self-hosted project runtime:** one project = multiple typed services (web, worker, postgres, redis), explicit bindings, Railpack/Dockerfile builds on local Docker under gVisor, Domains-managed HTTPS URLs, durable BullMQ operations, scheduled backups, and per-service git push-to-deploy. Launch bar is that loop — not Coolify feature sprawl.

## Happy path (v1)

```text
create empty project (pinned to local node)
  → add web/worker services (persist first, deploy async)
  → add postgres/redis services on demand (async provision)
  → bind apps to data services (DATABASE_URL / REDIS_URL)
  → deploy each app service (manual, image/Dockerfile/Railpack, or git webhook)
  → route primary web to {slug}.{baseDomain}; additional web services by name
  → edge: cloudflared serves *.baseDomain
  → scheduled Postgres backups → platform S3 (lazy bucket)
```

## v1 in scope (build now)

| Capability                | Spec                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Postgres / Redis / S3** | Dedicated Postgres + Redis **containers per project**; shared MinIO with per-project buckets — [data-plane.md](./data-plane.md) |
| **Secrets**               | Encrypted at rest; `secrets.yaml`; inject `DATABASE_URL` / `REDIS_URL` / `S3_*` on deploy                                       |
| **Build**                 | Railpack (default for source) or Dockerfile / prebuilt image                                                                    |
| **Runtime**               | Single Docker host; user apps under gVisor — [secure-runtime.md](./secure-runtime.md)                                           |
| **Backups**               | On-demand + scheduled Postgres dumps to platform backup bucket                                                                  |
| **Proxy**                 | `{slug}.{baseDomain}` → app — [access.md](./access.md)                                                                          |
| **Edge**                  | **cloudflared** as the v1 edge (wildcard once)                                                                                  |
| **Git webhooks**          | Push-to-deploy main track                                                                                                       |
| **Ops UX**                | Create / list / destroy, deploy, stop, logs, backups                                                                            |
| **Organizations**         | Soft multi-user: invite members (`owner` / `member`); system settings gated to instance admins                                  |

## Optional addon (not GTM)

| Addon | Spec |
| --- | --- |
| **Observe** | Sentry-compatible errors + OTLP traces/metrics/logs; ClickHouse required; Deploy\|Observe UI — [observe.md](./observe.md) |

## Designed for later (do not build in v1; don’t paint into a corner)

| Later                        | Design now                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| **Preview deployments (v2)** | Slot-based provisioning + reserved preview hostnames — [data-plane.md](./data-plane.md) |
| **Custom domains (v2)**      | `service_hostnames.kind=custom` + multi-host Caddy — [access.md](./access.md) / [gtm.md](./gtm.md) |
| **Other edges (v2)**         | Proxy adapters beyond cloudflared                                                       |
| **Multi-node (v3)**          | Project pinned to one node; that node’s shared data plane only                          |

## Out of scope (do not build)

- MySQL, MongoDB, MariaDB, ClickHouse, or any DB beyond Postgres
- External managed DBs as the default (dedicated containers are first-class; external is a later `source`)
- Docker Compose as a first-class deploy path
- Nixpacks, Paketo, Heroku buildpacks (Railpack only)
- Full ingress-controller kitchen sink
- Public Postgres/Redis as a product feature
- Multi-server **implementation** in v1 (schema/placement hooks ok — [data-plane.md](./data-plane.md))
- One-click templates / app marketplace
- SSO / fine-grained RBAC (soft orgs with `owner`/`member` invites are in scope)
- CLI, general-purpose public API keys
- Browser terminal, volume browser
- Slack/Discord/Telegram/email notification **hubs**
- Full metrics dashboards as Deploy core (optional **Observe** addon — [observe.md](./observe.md))

### Thin notify exception (GTM)

Full notification products stay out. **Allowed:** one operator-configured **HTTPS webhook** fired on deploy/provision **failure** (optional success). See [gtm.md](./gtm.md). Do not expand into a Coolify-style notify matrix.

### MCP (in scope)

Operator **MCP personal access tokens** + Streamable HTTP at `/api/mcp` for Cursor/agent deploy — see [mcp.md](./mcp.md). Not a general public REST API. Not a substitute for a typed CLI.

## Stack (v1)

| Layer         | Tech                                                |
| ------------- | --------------------------------------------------- |
| Control plane | TanStack Start, oRPC, Better Auth, Drizzle + SQLite |
| Data plane    | Postgres 16, Redis 7, MinIO (compose) on the node   |
| Build         | Railpack or Dockerfile + BuildKit                   |
| App runtime   | Docker + **gVisor (`runsc`)** for user apps         |
| Proxy / edge  | Platform reverse proxy + **cloudflared**            |
| Tooling       | pnpm monorepo, Vite+, Oxlint, Oxfmt, Vitest         |

## Injected env (every deploy)

```text
DATABASE_URL
REDIS_URL
S3_ENDPOINT
S3_BUCKET
S3_ACCESS_KEY
S3_SECRET_KEY
```

No Hostrig SDK required — apps read standard env vars. URLs must be valid **on the node** for the app container ([data-plane.md](./data-plane.md)).

## Messaging constraints

Follow [sequencing.md](./sequencing.md) and [gtm.md](./gtm.md):

- Market v1 as **service-first** stack + gVisor sandbox + **platform wildcard** URL via cloudflared + git push
- Do **not** imply PR previews, custom domains, multi-node, Let’s Encrypt on Caddy, or a CLI
- Do **not** imply Postgres/Redis are publicly proxied
- TLS: terminate at Cloudflare (or local HTTP); Caddy stays HTTP-only on the host
