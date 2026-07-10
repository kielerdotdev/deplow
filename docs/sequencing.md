# Sequencing

Stop treating every good idea as equal. **Build v1. Design so v2/v3 don’t require a rewrite.**

## v1 — ship this (must)

Single Docker host. One shared Postgres / Redis / MinIO on that host. Many projects share them (logical tenancy).

| Must | Notes |
| --- | --- |
| Project bundle | Postgres DB + Redis namespace + S3 bucket + secrets + backups |
| Build / run | Railpack, Dockerfile, or image; gVisor for user apps |
| **Proxy** | `{slug}.{baseDomain}` → app container |
| **Edge: cloudflared** | Wildcard DNS once → tunnel → proxy. Primary v1 edge |
| **Git webhooks** | Push → build → deploy main track |
| Ops | Logs, stop, destroy, on-demand + scheduled backups |

**Not v1:** PR/branch **preview deployments**, Tailscale/Netbird edges, multi-node, custom domains beyond the platform wildcard.

**v1 done when:** create project → webhook or manual deploy → public URL on `*.baseDomain` via cloudflared → backup → destroy, with gVisor defaults.

## v2 — next product slice

| Item | Depends on |
| --- | --- |
| Preview deployments | Proxy hostname scheme + **data-plane slots** (see [data-plane.md](./data-plane.md)) |
| More edges (Tailscale Serve, Netbird, direct TLS) | Same proxy; new adapters |
| Custom domains (optional) | Proxy; not required for wildcard happy path |

## v3 — capacity

| Item | Model |
| --- | --- |
| Multi-node | **Project is atomic to one node.** Each node has its own shared Postgres/Redis/MinIO. Many projects per node. Never app-on-A / DB-on-B. |

## Rules for contributors

1. If it’s not in the **v1** table, do not implement it “while you’re here.”
2. If a v1 change would **block** v2/v3, stop and follow [data-plane.md](./data-plane.md) / [access.md](./access.md) design constraints instead of hardcoding “one global postgres forever” in a corner.
3. Docs and marketing may mention the roadmap; they must not imply previews or multi-node ship in v1.
