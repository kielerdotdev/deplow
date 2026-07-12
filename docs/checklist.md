# deplow — Progress checklist

**Canonical:** [sequencing](./sequencing.md) · [product](./product.md) · [data-plane](./data-plane.md) · [goal](./goal.md)

> **v1:** bundle + gVisor + proxy + **cloudflared** + **git webhooks** (+ backups).  
> **v2:** previews + more edges (design data-plane slots now).  
> **v3:** multi-node, project-atomic.  
> Security > easy install > performance.

Core logic: `apps/web/src/lib/core/` (no oRPC / TanStack / React imports).

---

## Philosophy (summary)

| Principle                    | Meaning                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| **Service-first bundle**     | Project is a container; add web/worker/postgres/redis + bindings (not a resource catalog).  |
| **Dedicated data services**  | Postgres + Redis containers per project; shared MinIO; capability interfaces for backup/PITR. |
| **Slots**                    | Production now; preview slots later — [data-plane.md](./data-plane.md).                       |
| **Proxy + cloudflared (v1)** | Wildcard once → `{slug}.{baseDomain}`.                                                        |
| **Git webhooks (v1)**        | Push-to-deploy. Previews = v2.                                                                |
| **Security first**           | gVisor + hardened HostConfig.                                                                 |

---

## Status

| Area                                                      | Status                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Auth                                                      | ✅                                                                     |
| Soft organizations (invite members, system vs org settings) | ✅                                                                   |
| Schema (`projects` / `nodes` / `deployments` / `backups`) | ✅                                                                     |
| Provision Postgres / Redis / MinIO                        | ✅ (harden toward slots + `nodeId` — [data-plane.md](./data-plane.md)) |
| Encrypt credentials + secrets.yaml                        | ✅                                                                     |
| Docker image deploy + logs + stop                         | ✅                                                                     |
| oRPC projects / nodes / deployments                       | ✅                                                                     |
| Basic project UI                                          | ✅                                                                     |
| On-demand Postgres backup → S3                            | ✅                                                                     |
| **Railpack / Dockerfile source build**                    | ✅ **M1**                                                              |
| **Scheduled auto-backups**                                | ✅ **M2**                                                              |
| Destroy cleans containers + infra reliably                | ✅                                                                     |
| **gVisor + hardened HostConfig**                          | ✅ **G1** [secure-runtime.md](./secure-runtime.md)                     |
| **Proxy + cloudflared + wildcard URLs**                   | ✅ **G2** [access.md](./access.md)                                     |
| **Git webhooks**                                          | ✅ **v1** (per-service; signature-verified)                            |
| Preview deployments                                       | ⬜ **v2** (design only)                                                |
| Multi-node                                                | ⬜ **v3** (design only)                                                |

---

## GOAL milestones (see [goal.md](./goal.md))

- [x] **M1–M4** — Railpack, backups, harden loop, opinionated stack (prior)
- [x] **G0** — Data-plane hooks (`nodeId`, production slot; service-first)
- [x] **G1** — Secure runtime (gVisor)
- [x] **G2** — Proxy + cloudflared
- [x] **G3** — Git webhooks
- [x] **G4** — World-class UX (ux-roadmap P0+P1) — see shipped notes in [ux-roadmap.md](./ux-roadmap.md)
- [ ] **G5** — Harden + docs (GTM bar: [gtm.md](./gtm.md))
- [x] **G6** — Git OAuth (GitHub App + GitLab) [git-oauth.md](./git-oauth.md)

---

## Do not build now

Previews UI, **custom domains** (v1 = platform wildcard — [gtm.md](./gtm.md)), multi-node, Tailscale/Netbird **compose profiles** (adapters documented in [access.md](./access.md)), Compose deploys, MySQL/Mongo, templates, teams/RBAC, CLI, Slack/Discord notification hubs, metrics UI.

Allowed carve-outs: MCP operator tokens + `/api/mcp` ([mcp.md](./mcp.md)); thin HTTPS failure webhook ([product.md](./product.md) / [gtm.md](./gtm.md)).
