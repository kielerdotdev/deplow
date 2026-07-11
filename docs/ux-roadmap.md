# UX roadmap — “just works” PaaS

Implementation roadmap for deplow’s control-plane UX. Grounded in deep research of Vercel, Railway, Render, Fly.io, and self-hosted panels (Coolify / Dokploy).

**Product constraints still win:** see [sequencing.md](./sequencing.md) and [product.md](./product.md). v1 = proxy + cloudflared + webhooks (not previews). Design linking per [data-plane.md](./data-plane.md). This doc prioritizes making the **in-scope** happy path feel like Railway/Vercel — not like a server control panel.

## One-sentence strategy

**Be more opinionated than Railway’s canvas and more automatic than Render’s Blueprint: every project is the same stack, every deploy is detect-and-run, every credential is injected, and the UI only asks for a name and a source.**

---

## What “just works” means

Across the best PaaS products, the magic is the same loop:

1. **One primary action** (create / deploy) — not a wizard of many choices
2. **Platform owns the glue** (build detection, env injection, backups)
3. **Progress is visible** (status + streaming logs)
4. **Recovery is one click** (redeploy / rollback / destroy)
5. **Escape hatches later** (Dockerfile, custom vars, image deploy) — not on day one

Railway’s philosophy: deploy without thinking about CI/CD, networking, etc. **until you need to** — “take what you need, leave what you don’t.”

deplow already owns the hard product version of this (bundled Postgres + Redis + S3). The UI must match: refuse to look like Coolify/Dokploy feature sprawl.

---

## Research summary (what to steal / ignore)

### Vercel — fewest decisions

| Pattern                                                     | Steal?       | Notes                                                         |
| ----------------------------------------------------------- | ------------ | ------------------------------------------------------------- |
| Framework-defined / zero-config build                       | Partial      | We use Railpack + Dockerfile detection, not framework lock-in |
| One next action after create                                | **Yes**      | Project page should scream Deploy                             |
| Clear status vocabulary (queued → building → ready / error) | **Yes**      | Status dots + relative time                                   |
| Instant rollback (point at previous immutable deploy)       | **Yes (P1)** | Feasible without domains: re-run / retag last good image      |
| Preview URLs / Drop / edge                                  | **No**       | Out of scope                                                  |

### Railway — closest model (Railway-shaped DX)

| Pattern                                        | Steal?           | Notes                                                                                                                                    |
| ---------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Project = app + data plane in one mental model | **Yes**          | We go further: fixed bundle, not à-la-carte services                                                                                     |
| Railpack default; Dockerfile if present        | **Yes**          | Already product law — UI must not ask “which builder?”                                                                                   |
| Auto-inject credentials                        | **Yes**          | Keep auto-inject (we are not multi-DB). Railway moved to explicit `${{Service.VAR}}` for multi-service; our opinionation is an advantage |
| Live build + deploy logs                       | **Yes**          | Deploy as a living object                                                                                                                |
| Canvas graph of many services                  | **No (for now)** | Fixed stack → **stack summary tiles** beat a freeform graph                                                                              |
| `railway up -y` / Cmd+K / healthcheck rollback | Later            | CLI/palette out of scope; healthcheck rollback is P2                                                                                     |

### Render — predictable, not magical

| Pattern                               | Steal?                   | Notes                                           |
| ------------------------------------- | ------------------------ | ----------------------------------------------- |
| `fromDatabase` / Blueprint env wiring | As **platform behavior** | User should never write YAML for `DATABASE_URL` |
| `generateValue` for secrets           | Already covered          | We provision + encrypt                          |
| Per-service plan / type sprawl        | **No**                   | Wrong shape                                     |

### Fly.io — power-user CLI

| Pattern                                     | Steal? | Notes                         |
| ------------------------------------------- | ------ | ----------------------------- |
| `fly.toml` + region/size decisions up front | **No** | Loses the “weekend MVP” race  |
| Excellent CLI                               | Later  | Out of scope for current goal |

### Coolify / Dokploy — anti-patterns

Self-hosted UIs often win on feature count and lose on path clarity: compose, many DBs, multi-server, templates, proxies… every screen asks “what kind of thing is this?”

**Do not become that.** Opinionation is the UX.

---

## Already right (protect these)

- Bundled infra on create (not à-la-carte)
- Auto-inject `DATABASE_URL` / `REDIS_URL` / `S3_*`
- Railpack default + Dockerfile if present
- Scheduled backups by default
- Destroy tears down containers + infra
- Downloadable `secrets.yaml`

UI copy should reinforce the one-line mental model everywhere:

> This project is your app plus Postgres, Redis, and S3. Deploy source; we inject credentials and back up Postgres.

---

## Implementation roadmap

### P0 — Happy-path UX (do next)

These make create → deploy → logs feel like Railway, without new product surface area.

#### P0.1 — Post-create: provisioned stack, not empty form

After create, land on a project page that shows the stack as **ready** tiles:

| Tile     | Content                                      |
| -------- | -------------------------------------------- |
| App      | Not deployed / Running / Failed + Deploy CTA |
| Postgres | Ready                                        |
| Redis    | Ready                                        |
| S3       | Ready                                        |
| Backups  | Schedule + last backup status                |

- **Primary CTA:** Deploy
- **Secondary:** Download `secrets.yaml`
- Do not lead with a blank deploy form and unrelated settings

#### P0.2 — Deploy without thinking

- Default path: **source** (local path / upload / whatever M1 already supports)
- **Never ask which builder** — detect Dockerfile → `docker build`, else Railpack
- Prebuilt image = **advanced** / secondary tab, not equal default for new users
- Hide host/node selection when a local Docker node exists (implicit)
- Bury or remove “spawn build server” and raw port knobs from the first-run path (advanced section OK)

#### P0.3 — Deploy as a living object

On Deploy:

1. Create deployment row
2. Stay on (or open) a deployment detail / panel
3. Stream build then runtime logs
4. Single status machine: `queued → building → deploying → running | failed`
5. Failed → short error + View logs + Retry

Do not dump the user back to a static table with no feedback.

#### P0.4 — Secrets as the local-dev hero

Railway’s `railway run` injects env locally. Our equivalent is `secrets.yaml`:

- One-click download, obvious placement
- Short copy: use these env vars locally against provisioned infra
- Do not bury under a generic “settings” dump

### P1 — Recovery and confidence

#### P1.1 — Redeploy / retry

One click to redeploy last successful config (same source or same image).

#### P1.2 — Previous-deployment rollback

Keep prior deployment images tagged. “Roll back” = run the previous known-good image with current project secrets. Public URL continuity is a proxy concern ([access.md](./access.md)).

#### P1.3 — Backup status on the project surface

Schedule + last success/failure already in product — surface them on the stack summary (not only a backups tab).

### P2 — Polish (after P0/P1)

| Item                             | Notes                              | Scope check                                                |
| -------------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| Command palette (Cmd+K)          | Jump to project / deploy / destroy | OK if thin                                                 |
| Healthcheck path → auto rollback | Like Railway                       | Optional; needs health endpoint convention                 |
| Relative timestamps on status    | “Building · 12s”                   | Cosmetic                                                   |
| Staged changes + single Deploy   | Railway canvas pattern             | Only if we add multi-field edits that shouldn’t apply live |

### Explicitly not on this roadmap

Do not implement under the guise of UX polish (see [product.md](./product.md)):

- Full ingress-controller kitchen sink (proxy + cloudflared in v1 — see [access.md](./access.md))
- Preview deployments UI (v2 — [sequencing.md](./sequencing.md))
- Freeform service canvas / multi-DB
- Templates marketplace
- Metrics dashboards / browser terminal
- CLI / public API keys / teams

(Git webhooks are **v1**. Previews are **v2**.)

---

## Shared UX grammar (checklist for every screen)

When reviewing UI work, ask:

- [ ] Is there **one** obvious primary action?
- [ ] Did we ask the user to choose something the platform can detect?
- [ ] Are credentials **injected**, not assembled by the user?
- [ ] Is progress **visible** (status + logs)?
- [ ] Can they **recover** (retry / rollback / destroy) without leaving the project?
- [ ] Would this screen still make sense if we removed “nodes,” “providers,” and infra jargon?

If a screen fails these, it is Coolify-shaped. Fix it.

---

## Ranked steal list

| Priority | Pattern                                        | From             | Fit                                       |
| -------- | ---------------------------------------------- | ---------------- | ----------------------------------------- |
| P0       | Create → provisioned stack → single Deploy CTA | Railway          | Exact                                     |
| P0       | Builder auto-detect (Dockerfile \| Railpack)   | Railway          | Exact                                     |
| P0       | Auto env injection + secrets download          | Railway / Heroku | Exact                                     |
| P0       | Live deploy status + logs                      | All              | Exact                                     |
| P1       | Default backups visible on project             | Render / Railway | Exact                                     |
| P1       | Redeploy / retry failed deploy                 | Vercel / Railway | Exact                                     |
| P1       | Previous deployment rollback (image)           | Vercel           | Feasible without domains                  |
| P2       | Cmd+K                                          | Railway          | Nice later                                |
| P2       | Healthcheck → auto rollback                    | Railway          | Later                                     |
| Later    | Wildcard proxy + cloudflared                   | Dokploy          | **v1** — [access.md](./access.md)         |
| Later    | Git webhooks                                   | Vercel/Railway   | **v1**                                    |
| Later    | PR/branch previews                             | Vercel           | **v2** — [sequencing.md](./sequencing.md) |
| —        | Templates, multi-DB canvas                     | —                | Out of scope                              |

---

## Suggested implementation order

1. ~~**P0.1** — Project page stack summary + Deploy as primary CTA~~ **done**
2. ~~**P0.2** — Simplify deploy form (source default, detect builder, hide node/ports)~~ **done**
3. ~~**P0.3** — Deployment detail with live status + logs~~ **done** (async queue + poll)
4. ~~**P0.4** — Elevate secrets download~~ **done**
5. ~~**P1.1–P1.3** — Retry, rollback, backup status on summary~~ **done**
6. **P2** only if the happy path already feels boringly reliable

### Shipped notes (2026-07-11)

- Overview: mental-model copy, living deploy banner, failed+retry strip, secrets strip, 5 stack tiles (App / Postgres / Redis / S3 / Backups)
- Header: Deploy primary + Secrets secondary + Roll back in menu
- `runProductionDeploy` returns `queued` immediately; `executeProductionDeploy` runs in-process; UI polls ~1.5s and streams build logs in the ActionDialog
- E2E polls `deployments/get` until `running`
