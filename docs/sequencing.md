# Sequencing

Stop treating every good idea as equal. **Build v1. Design so v2/v3 don’t require a rewrite.** Launch bar: [gtm.md](./gtm.md).

## v1 — ship this (must)

Single Docker host. **Service-first:** empty project → add typed services (web / worker / postgres / redis) → bindings. Dedicated Postgres/Redis **containers per service**; shared MinIO with per-project buckets. See [data-plane.md](./data-plane.md).

| Must                  | Notes                                                                      |
| --------------------- | -------------------------------------------------------------------------- |
| Service-first stack   | Web/worker + postgres/redis + lazy S3 + secrets + backups                  |
| Build / run           | Railpack, Dockerfile, or image; gVisor for user apps                       |
| **Proxy**             | `{slug}.{baseDomain}` → app container; domains app-managed                 |
| **Edge: cloudflared** | Wildcard DNS once → tunnel → proxy. Primary v1 edge; TLS at Cloudflare     |
| **Git webhooks**      | Per-service push → build → deploy main track                               |
| Ops                   | Logs, stop, destroy, on-demand + scheduled backups                         |
| Host bootstrap        | `scripts/install.sh` verifies BuildKit + Railpack + gVisor                 |

**Not v1:** PR/branch **preview deployments**, **custom domains**, first-class Tailscale/Netbird compose profiles, multi-node, CLI, notification hubs (thin failure webhook exception — [product.md](./product.md)).

**v1 done when:** [gtm.md](./gtm.md) happy path — install → create → services → webhook or manual deploy → public URL on `*.baseDomain` → backup → destroy, with gVisor defaults. Docs match code.

## v2 — next product slice

| Item                                              | Depends on                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Preview deployments                               | Proxy hostname scheme + **data-plane slots** + `service_hostnames.kind=preview`         |
| Custom domains                                    | `service_hostnames.kind=custom` + multi-host Caddy (schema ready)                       |
| More edges (Tailscale Serve, Netbird, direct TLS) | **Same Caddy origin** (`http://caddy:80` / `http://127.0.0.1:8088`); new adapters only |

## v3 — capacity

| Item       | Model                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-node | **Project is atomic to one node.** Each node has its own data plane. Many projects per node. Never app-on-A / DB-on-B.                 |

## Rules for contributors

1. If it’s not in the **v1** table, do not implement it “while you’re here.”
2. If a v1 change would **block** v2/v3, stop and follow [data-plane.md](./data-plane.md) / [access.md](./access.md) design constraints instead of hardcoding “one global postgres forever” in a corner.
3. Docs and marketing may mention the roadmap; they must not imply previews, custom domains, or multi-node ship in v1.
4. Do not claim Let’s Encrypt on Caddy or a typed CLI until those actually ship.
