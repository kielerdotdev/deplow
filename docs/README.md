# deplow docs

Canonical project documentation. **These files dictate product, marketing, and implementation.** If the marketing site, Starlight user docs, README, or code disagree with this folder, this folder wins — update the other surfaces.

## Reading order

| Doc | Role |
| --- | --- |
| [philosophy.md](./philosophy.md) | **Why deplow exists** — the problem we solve and the principles we will not dilute |
| [sequencing.md](./sequencing.md) | **v1 / v2 / v3** — what to build now vs later |
| [product.md](./product.md) | **What we ship** — one project shape, in/out of scope |
| [data-plane.md](./data-plane.md) | **DB/Redis/S3 linking** — design for previews + multi-node without building them yet |
| [security.md](./security.md) | **Security stance** — non-negotiable priorities; marketing must not contradict this |
| [access.md](./access.md) | **Proxy + cloudflared (v1)** — wildcard URLs; data plane stays private |
| [secure-runtime.md](./secure-runtime.md) | **How user apps run** — gVisor + hardened Docker implementation spec |
| [goal.md](./goal.md) | **Agent GOAL (v1)** — implement proxy, cloudflared, webhooks, gVisor, world-class UX |
| [checklist.md](./checklist.md) | Progress against the goal |
| [ux-roadmap.md](./ux-roadmap.md) | **Control-plane UX roadmap** — “just works” patterns from Vercel/Railway/Render/Fly; what to implement next |

## Surfaces that must stay aligned

| Surface | Must follow |
| --- | --- |
| Root `README.md` | philosophy + product (short) |
| `apps/site` landing page | philosophy + security (honest, not soft) |
| `apps/site` Starlight docs | product + security + secure-runtime (user-facing) |
| Code in `apps/web/src/lib/core/` | product + secure-runtime |

## Not in this folder

User-facing install/guides live under `apps/site/src/content/docs/` (Starlight). They are derived from these docs, not a second source of truth.
