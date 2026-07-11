# deplow — Progress checklist

**Canonical:** [sequencing](./sequencing.md) · [product](./product.md) · [data-plane](./data-plane.md) · [goal](./goal.md)

> **v1:** bundle + gVisor + proxy + **cloudflared** + **git webhooks** (+ backups).  
> **v2:** previews + more edges (design data-plane slots now).  
> **v3:** multi-node, project-atomic.  
> Security > easy install > performance.

Core logic: `apps/web/src/lib/core/` (no oRPC / TanStack / React imports).

---

## Philosophy (summary)

| Principle                    | Meaning                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| **Bundle, not tabs**         | DB + object storage + runtime provisioned together.                                |
| **One instance per node**    | Shared Postgres/Redis/MinIO per node; many projects; no per-project DB containers. |
| **Slots**                    | Production now; preview slots later — [data-plane.md](./data-plane.md).            |
| **Proxy + cloudflared (v1)** | Wildcard once → `{slug}.{baseDomain}`.                                             |
| **Git webhooks (v1)**        | Push-to-deploy. Previews = v2.                                                     |
| **Security first**           | gVisor + hardened HostConfig.                                                      |

---

## Status

| Area                                                      | Status                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Auth                                                      | ✅                                                                     |
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
| **Proxy + cloudflared + wildcard URLs**                   | ⬜ **v1** [access.md](./access.md)                                     |
| **Git webhooks**                                          | ⬜ **v1**                                                              |
| Preview deployments                                       | ⬜ **v2** (design only)                                                |
| Multi-node                                                | ⬜ **v3** (design only)                                                |

---

## GOAL milestones (see [goal.md](./goal.md))

- [x] **M1–M4** — Railpack, backups, harden loop, opinionated stack (prior)
- [ ] **G0** — Data-plane hooks (`nodeId`, production slot)
- [x] **G1** — Secure runtime (gVisor)
- [ ] **G2** — Proxy + cloudflared
- [ ] **G3** — Git webhooks
- [ ] **G4** — World-class UX (ux-roadmap P0+P1)
- [ ] **G5** — Harden + docs
- [x] **G6** — Git OAuth (GitHub App + GitLab) [git-oauth.md](./git-oauth.md)

---

## Do not build now

Previews UI, multi-node, Tailscale/Netbird edges, Compose deploys, MySQL/Mongo, per-project DB containers, templates, teams/RBAC, CLI, metrics UI.
