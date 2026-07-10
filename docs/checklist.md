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

| Area                                                                         | Status                                 |
| ---------------------------------------------------------------------------- | -------------------------------------- |
| Auth                                                                         | ✅                                     |
| Schema (`projects` / `nodes` / `deployments` / `backups`)                    | ✅                                     |
| Provision Postgres / Redis / MinIO                                           | ✅                                     |
| Encrypt credentials + secrets.yaml                                           | ✅                                     |
| Docker image deploy + logs + stop                                            | ✅                                     |
| oRPC projects / nodes / deployments                                          | ✅                                     |
| Project UI (stack, deploy, settings, secrets)                                | ✅                                     |
| On-demand Postgres backup → S3                                               | ✅                                     |
| **Railpack / Dockerfile source build**                                       | ✅                                     |
| **Scheduled auto-backups**                                                   | ✅                                     |
| Destroy cleans containers + proxy + infra                                    | ✅                                     |
| **G0 — Data-plane hooks** (`nodeId`, production slot, Docker-network inject) | ✅                                     |
| **G1 — gVisor + hardened HostConfig**                                        | ✅                                     |
| **G2 — Proxy + cloudflared + wildcard URLs**                                 | ✅                                     |
| **G3 — Git webhooks** (signature-verified push-to-deploy)                    | ✅                                     |
| Preview deployments                                                          | ⬜ **v2** (design only — do not build) |
| Multi-node                                                                   | ⬜ **v3** (design only — do not build) |

---

## GOAL milestones (see [goal.md](./goal.md))

- [x] **M1–M4** — Railpack, backups, harden loop, opinionated stack (prior)
- [x] **G0** — Data-plane hooks (`nodeId`, production slot)
- [x] **G1** — Secure runtime (gVisor)
- [x] **G2** — Proxy + cloudflared
- [x] **G3** — Git webhooks
- [x] **G4** — World-class UX (modular project surface, humanized errors, empty states, retry/rollback)
- [x] **G5** — Harden + docs (slot naming, proxy disk-truth, deploy lock, doctor, e2e portable, secrets fail-closed)

---

## Do not build now

Previews UI, multi-node, Tailscale/Netbird edges, Compose deploys, MySQL/Mongo, per-project DB containers, templates, teams/RBAC, CLI product, metrics UI.
