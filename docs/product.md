# Product

Canonical product shape. **What to build when:** [sequencing.md](./sequencing.md). Philosophy: [philosophy.md](./philosophy.md). Data linking: [data-plane.md](./data-plane.md).

## One-line

**Opinionated self-hosted project runtime:** one project = multiple services + linked Postgres, Redis, and S3, built with Railpack or Dockerfile, run on local Docker under gVisor, with scheduled backups, service-aware proxy URLs, and per-service git push-to-deploy.

## Happy path (v1)

```text
create project (on the local node)
  → link Postgres DB/user, Redis namespace, and S3 bucket
  → create primary "app" web service
  → add independent web services and workers
  → deploy each service (manual, image/Dockerfile/Railpack, or git webhook)
  → route primary web to {slug}.{baseDomain}; route additional web services by name
  → edge: cloudflared serves *.baseDomain
  → scheduled Postgres backups → platform S3
```

## v1 in scope (build now)

| Capability                | Spec                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Postgres / Redis / S3** | One shared instance each **per node** (v1 = one node); per-project **production** slot — [data-plane.md](./data-plane.md) |
| **Secrets**               | Encrypted at rest; `secrets.yaml`; inject `DATABASE_URL` / `REDIS_URL` / `S3_*` on deploy                                 |
| **Build**                 | Railpack (default for source) or Dockerfile / prebuilt image                                                              |
| **Runtime**               | Single Docker host; user apps under gVisor — [secure-runtime.md](./secure-runtime.md)                                     |
| **Backups**               | On-demand + scheduled Postgres dumps to platform backup bucket                                                            |
| **Proxy**                 | `{slug}.{baseDomain}` → app — [access.md](./access.md)                                                                    |
| **Edge**                  | **cloudflared** as the v1 edge (wildcard once)                                                                            |
| **Git webhooks**          | Push-to-deploy main track                                                                                                 |
| **Ops UX**                | Create / list / destroy, deploy, stop, logs, backups                                                                      |

## Designed for later (do not build in v1; don’t paint into a corner)

| Later                        | Design now                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| **Preview deployments (v2)** | Slot-based provisioning + reserved preview hostnames — [data-plane.md](./data-plane.md) |
| **Other edges (v2)**         | Proxy adapters beyond cloudflared                                                       |
| **Multi-node (v3)**          | Project pinned to one node; that node’s shared data plane only                          |

## Out of scope (do not build)

- MySQL, MongoDB, MariaDB, ClickHouse, or any DB beyond Postgres
- Per-project dedicated Postgres/Redis **containers** (shared instance per node only)
- Docker Compose as a first-class deploy path
- Nixpacks, Paketo, Heroku buildpacks (Railpack only)
- Full ingress-controller kitchen sink
- Public Postgres/Redis as a product feature
- Multi-server **implementation** in v1 (schema/placement hooks ok — [data-plane.md](./data-plane.md))
- One-click templates / app marketplace
- Notifications, teams/RBAC, CLI, public API keys
- Browser terminal, volume browser, metrics dashboards

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

No deplow SDK required — apps read standard env vars. URLs must be valid **on the node** for the app container ([data-plane.md](./data-plane.md)).

## Messaging constraints

Follow [sequencing.md](./sequencing.md): market v1 as bundle + sandbox + wildcard URL via cloudflared + git push. Do not imply PR previews or multi-node ship in v1. Do not imply Postgres/Redis are publicly proxied.
