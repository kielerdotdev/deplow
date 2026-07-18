# Product

Canonical product shape. **What to build when:** [sequencing.md](./sequencing.md). Philosophy: [philosophy.md](./philosophy.md). Data linking: [data-plane.md](./data-plane.md).

## One-line

**Opinionated self-hosted PaaS on k3s:** one project = typed services (web, worker, postgres, redis) as Kubernetes workloads, Domains-managed Ingress URLs, stupidly easy cluster connect / Hetzner node add, and per-service git push-to-deploy. Launch bar is that loop — not Coolify-on-Docker.

## Happy path (v1)

```text
connect or create k3s cluster (Settings → Cluster)
  → create empty project
  → add web/worker services (persist first, deploy async)
  → add postgres/redis on demand (StatefulSet / Deployment in project namespace)
  → bind apps to data services (DATABASE_URL / REDIS_URL)
  → deploy image (Whoami) → Traefik Ingress {slug}.{baseDomain}
  → add Hetzner or self-hosted k3s workers to grow capacity (no autoscaling)
```

## v1 in scope (build now)

| Capability                | Spec                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Cluster**               | BYO kubeconfig or Hetzner cloud-init k3s; workers via Hetzner cloud-init **or** self-hosted join script |
| **Postgres / Redis / S3** | Postgres/Redis as k8s workloads per project; shared MinIO with per-project buckets — [data-plane.md](./data-plane.md)           |
| **Secrets**               | Encrypted at rest; inject `DATABASE_URL` / `REDIS_URL` / `S3_*` on deploy                                                       |
| **Build**                 | Prebuilt image **or** git → Railpack/Dockerfile → push default registry (Settings → Registries) → k3s pull secrets auto        |
| **Runtime**               | **k3s only** — Deployments / StatefulSets / Ingress; user apps under **gVisor** RuntimeClass ([secure-runtime.md](./secure-runtime.md)) |
| **Proxy**                 | Traefik Ingress `{slug}.{baseDomain}` — [access.md](./access.md)                                                                |
| **Git webhooks**          | Push-to-deploy main track                                                                                                       |
| **Ops UX**                | Create / list / destroy, deploy, stop, logs, rollback                                                                           |
| **Organizations**         | Soft multi-user: invite members (`owner` / `member`); system settings gated to instance admins                                  |
| **Interfaces**            | Web dashboard · MCP · thin operator CLI — same oRPC/core backend ([mcp.md](./mcp.md))                                           |

## Optional addon (not GTM)

| Addon | Spec |
| --- | --- |
| **Observe** | Sentry-compatible errors + OTLP traces/metrics/logs; ClickHouse required; Deploy\|Observe UI — [observe.md](./observe.md) |

## Designed for later (do not build in v1; don’t paint into a corner)

| Later                        | Design now                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| **Preview deployments (v2)** | Slot-based provisioning + reserved preview hostnames — [data-plane.md](./data-plane.md) |
| **Custom domains (v2)**      | `service_hostnames.kind=custom` + multi-host Ingress — [access.md](./access.md) / [gtm.md](./gtm.md) |
| **In-cluster Kaniko (v2)**   | Move build Jobs into k3s; registry push path already required                           |
| **HA replicas (v2)**         | Replica counts + PDB on web services                                                    |

## Out of scope (do not build)

- MySQL, MongoDB, MariaDB, ClickHouse, or any DB beyond Postgres
- External managed DBs as the default (dedicated containers are first-class; external is a later `source`)
- Docker Compose as a first-class deploy path
- Nixpacks, Paketo, Heroku buildpacks (Railpack only)
- Full ingress-controller kitchen sink
- Public Postgres/Redis as a product feature
- Docker-agent / mesh remotes (removed; k3s only)
- hetzner-k3s CLI as a create/scale path (removed)
- Autoscaling / MicroVMs (Kata / Firecracker)
- One-click templates / app marketplace
- SSO / fine-grained RBAC (soft orgs with `owner`/`member` invites are in scope)
- General-purpose public REST API productization (MCP + CLI share operator PATs over oRPC — not a third API surface)
- Desktop / Electron / native apps
- Built-in transactional mail server, MySQL/Mongo catalogs, Compose-as-deploy
- Browser terminal, volume browser
- Slack/Discord/Telegram/email notification **hubs**
- Full metrics dashboards as Deploy core (optional **Observe** addon — [observe.md](./observe.md))
- CLI that bypasses the control plane (no local Docker/k8s product runtime in the CLI)

### Thin notify exception (GTM)

Full notification products stay out. **Allowed:** one operator-configured **HTTPS webhook** fired on deploy/provision **failure** (optional success). See [gtm.md](./gtm.md). Do not expand into a Coolify-style notify matrix.

### Interfaces (in scope): Web · MCP · CLI

Three clients, **one backend** (oRPC + core services):

| Surface | Role |
| --- | --- |
| **Web** | Full operator UI |
| **MCP** | Streamable HTTP at `/api/mcp` for Cursor/agents — [mcp.md](./mcp.md) |
| **CLI** | Thin remote client (`hostrig`): login, projects, deploy, logs, status, rollback. Same operator PATs as MCP. No desktop; no second control plane. |

Market **Web · MCP · CLI** once the thin client is in the monorepo (`apps/cli`). Never market a desktop app.

## Stack (v1)

| Layer         | Tech                                                |
| ------------- | --------------------------------------------------- |
| Control plane | TanStack Start, oRPC, Better Auth, Drizzle + SQLite |
| App runtime   | **k3s** (Deployments, StatefulSets, Traefik)        |
| Cluster ops   | BYO kubeconfig + Hetzner cloud-init + self-hosted join |
| Data plane    | Postgres/Redis in-cluster; MinIO for platform S3    |
| Build         | Images now; in-cluster Kaniko/BuildKit next         |
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

- Market v1 as **service-first** stack on **k3s** + **gVisor** user apps + **platform wildcard** via edge → Traefik
- Interfaces: **Web · MCP · thin CLI** (claim CLI only after it ships); **never** desktop
- Do **not** imply PR previews, custom domains kitchen sink, public-IP/sslip dogfood, or Docker-agent
- Do **not** claim “Secure by default” / unbreakable / MicroVM-grade isolation — name gVisor and operator patch duty
- Do **not** imply Postgres/Redis are publicly proxied
- TLS: terminate at Cloudflare / Netbird / Tailscale; Traefik stays HTTP-only in the cluster
