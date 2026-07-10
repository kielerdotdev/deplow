# GOAL — Ship deplow v1 (agent brief)

You are implementing **deplow v1**. Follow this document. When anything conflicts with marketing copy or old comments in code, **this GOAL + `docs/sequencing.md` win**.

Read first (in order):

1. [`sequencing.md`](./sequencing.md) — v1 vs v2 vs v3
2. [`philosophy.md`](./philosophy.md) · [`product.md`](./product.md) · [`security.md`](./security.md)
3. [`data-plane.md`](./data-plane.md) · [`access.md`](./access.md) · [`secure-runtime.md`](./secure-runtime.md)
4. [`ux-roadmap.md`](./ux-roadmap.md) — UX patterns to steal

---

## Mission

Ship a **world-class, Railway/Vercel-feeling** control plane for this product:

```text
one project =
  app + Postgres + Redis + S3 + secrets + backups
  + public URL via proxy + cloudflared
  + git push-to-deploy
  + gVisor-sandboxed runtime
```

**v1 done when** an operator can: create a project → get a `https://{slug}.{baseDomain}` URL → deploy from git webhook or UI → see live logs → backup → destroy — and the UI never feels like Coolify feature sprawl.

---

## Non-negotiable product rules

| Rule                    | Detail                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Bundle                  | Create project always provisions Postgres + Redis + S3 together                                                        |
| One data plane per node | Shared instances; many projects; **no** per-project DB containers                                                      |
| Production slot         | v1 only creates `kind: "production"` resources — shape APIs for preview slots later ([data-plane.md](./data-plane.md)) |
| `nodeId`                | Every project pinned to a node (v1 = single local Docker node)                                                         |
| Runtime                 | User apps → **gVisor (`runsc`)** by default ([secure-runtime.md](./secure-runtime.md))                                 |
| Proxy                   | deplow owns hostname → container; **cloudflared** is the v1 edge ([access.md](./access.md))                            |
| Git                     | Webhooks push → deploy **main/production** only — **no preview deploys in this GOAL**                                  |
| Security                | security > easy install > performance                                                                                  |

### Explicitly DO NOT build

Preview deployments, multi-node placement UI, Tailscale/Netbird edges, Compose deploys, other DBs, templates, teams/RBAC, CLI, metrics dashboards, browser terminal, public Postgres/Redis, full Traefik kitchen sink.

Leave `SshNodeExecutor` / `HetznerSpawner` stubs alone or delete — do not implement.

---

## Already done (reuse — do not rewrite)

Monorepo: `@deplow/web`, `@deplow/db`, `@deplow/shared`.

- Auth (Better Auth)
- Schema: `projects`, `nodes`, `deployments`, `backups`
- `ProvisioningService` + Postgres/Redis/MinIO provisioners + encrypted credentials
- `BuildService` / Railpack + Dockerfile + image deploy path
- `DockerNodeExecutor`, `BackupService` (on-demand + scheduled)
- oRPC: `projects.*`, `nodes.*`, `deployments.*`
- Basic UI: home, login, `/projects/$projectId`, nodes page

**Core rules:**

- Business logic in `apps/web/src/lib/core/` stays **framework-agnostic** (no oRPC / React imports)
- oRPC handlers are thin adapters
- Match existing Zod contracts in `@deplow/shared`
- Prefer extending services over parallel abstractions
- `pnpm check` / `pnpm test` must pass

---

## UX bar — world-class (mandatory)

Treat UX as a **first-class milestone**, not polish at the end. Follow [`ux-roadmap.md`](./ux-roadmap.md).

### UX grammar (every screen)

- [ ] **One** obvious primary action
- [ ] Never ask what the platform can detect (builder, ports, node when only local exists)
- [ ] Credentials **injected** — user never assembles `DATABASE_URL`
- [ ] Progress **visible** (status + streaming logs)
- [ ] Recovery one click (retry / redeploy / rollback / destroy)
- [ ] No Coolify jargon: hide “nodes/providers” from the happy path

### Mental model (copy everywhere)

> This project is your app plus Postgres, Redis, and S3. Deploy source; we inject credentials, give you a URL, and back up Postgres.

### Required UX outcomes

| Area                 | Bar                                                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home / create**    | Name (and optional git URL) → create. No wizard of service checkboxes                                                                                                                                |
| **Project page**     | Stack summary tiles (App / Postgres / Redis / S3 / Backups) + **Deploy** as primary CTA + **public URL** copy button when live                                                                       |
| **Deploy**           | Source/git default; builder auto-detect; image deploy buried under Advanced                                                                                                                          |
| **Deployment**       | Living object: `queued → building → deploying → running \| failed` + live logs + Retry                                                                                                               |
| **Secrets**          | One-click `secrets.yaml` download — hero, not buried settings                                                                                                                                        |
| **Git**              | Connect repo / show webhook status; “Push to deploy” explained in one sentence                                                                                                                       |
| **URL**              | Show `https://{slug}.{baseDomain}` prominently after proxy is configured                                                                                                                             |
| **Empty / error**    | Human errors (e.g. `runsc` missing, cloudflared down) — never raw 500s for expected failures                                                                                                         |
| **Motion / density** | Use existing design system; prefer calm status + clear hierarchy over dashboard chrome. Match patterns already in `apps/web` (AppShell, StatusBadge, shadcn). Do not invent a second visual language |

Steal from Vercel/Railway: fewest decisions, live deploy, instant retry/rollback. **Do not** steal Coolify’s “every feature on one page.”

---

## Implementation milestones

Do in order. Each milestone should leave `pnpm check` / `pnpm test` green.

### G0 — Data-plane hooks (design debt, small)

Per [`data-plane.md`](./data-plane.md):

1. Ensure every project has `nodeId` → local Docker node (create node if missing)
2. Treat provisioned resources as **production slot** (naming/comments/types ready for `preview` later — no preview UI)
3. Injected `DATABASE_URL` / `REDIS_URL` / `S3_*` must work **inside** the app container on the Docker network (not laptop `localhost` for runtime)
4. Reserve preview hostname prefix in proxy config constants (e.g. `pr-`) so production slugs don’t collide later

### G1 — Secure runtime (gVisor)

Follow [`secure-runtime.md`](./secure-runtime.md) S1–S4:

1. `DEPLOW_APP_RUNTIME=runsc` (default), memory/CPU limits, `HostConfig` hardening on user `deployApp`
2. Preflight: missing `runsc` → clear deploy error when required
3. Platform compose + builds stay on runc
4. Surface runtime status in node/health if easy
5. Unit tests for HostConfig construction

### G2 — Platform proxy + cloudflared

Per [`access.md`](./access.md):

1. Local reverse proxy (Caddy, Traefik, or nginx — pick one pragmatic default; document it) routing `Host: {slug}.{baseDomain}` → project container
2. On deploy/stop/destroy: update proxy routes automatically
3. cloudflared integration: operator configures tunnel token + `DEPLOW_BASE_DOMAIN` (or equivalent); tunnel points at the proxy
4. Persist/display public URL on the project
5. Compose/docs: how to set wildcard DNS → cloudflared once
6. **Do not** expose Postgres/Redis through the proxy

### G3 — Git webhooks

1. Connect GitHub and/or GitLab repo to a project (PAT or app install — simplest secure path for v1)
2. Webhook endpoint verifies signatures
3. Push to configured branch → clone/fetch → build (Railpack/Dockerfile) → deploy production slot → update proxy
4. UI: connection status, last delivery, failed delivery reason
5. Manual deploy still works

### G4 — World-class UX

Implement [`ux-roadmap.md`](./ux-roadmap.md) **P0 + P1** (P2 optional):

1. **P0.1** Project stack summary + Deploy CTA
2. **P0.2** Deploy form: source default, auto builder, hide node/ports
3. **P0.3** Deployment detail with live status + logs
4. **P0.4** Elevate secrets download
5. **P1** Redeploy/retry, previous-image rollback, backup status on summary
6. Wire **public URL** + **git** into the same project surface (not separate “admin” islands)
7. Home: project list with status + URL when available

### G5 — Harden + docs

1. E2E or smoke: create → (mock or real) webhook deploy → URL route exists → backup → destroy
2. Destroy cleans: containers, proxy route, production DB/redis/bucket
3. Update root `README.md`, `.env.example`, Starlight prerequisites for gVisor + cloudflared + base domain
4. Align checklist; no v2 features accidentally shipped

---

## Acceptance criteria

### Product

- [x] Project create provisions production Postgres + Redis + S3; credentials encrypted; `nodeId` set
- [x] User app containers use gVisor + hardened HostConfig by default
- [x] Missing `runsc` fails deploy with actionable error when required
- [x] `{slug}.{baseDomain}` routes to the running app via platform proxy
- [x] cloudflared documented + configurable as v1 edge
- [x] Git webhook push deploys production; signature-verified
- [x] Image / Dockerfile / Railpack deploys still work from UI
- [x] Env injection + scheduled backups + destroy remain correct
- [x] No preview/multi-node/other-edge features shipped

### UX

- [x] New user can create → deploy without reading internal docs
- [x] Project page has one primary Deploy action and visible stack state
- [x] Deploy shows live status + logs; failure offers Retry
- [x] Public URL and secrets download are obvious
- [x] Git connection is understandable in one glance
- [x] Happy path hides nodes/providers/builder choice
- [x] Passes the UX grammar checklist above

### Engineering

- [x] Core stays framework-agnostic
- [x] `pnpm check` and `pnpm test` pass (when deps installed)
- [x] Tests for runtime HostConfig, proxy route naming, webhook signature verification (as applicable)

---

## Suggested work order

1. G0 data-plane hooks
2. G1 gVisor
3. G2 proxy + cloudflared
4. G3 webhooks
5. G4 UX (can overlap G2/G3 UI wiring — don’t leave URL/git as afterthought screens)
6. G5 harden + docs

When blocked, prefer the **smallest opinionated default** over a new settings page.

---

## Definition of world-class (for this repo)

World-class does **not** mean more features. It means:

1. The happy path has almost no decisions
2. The platform does the glue (build detect, env, URL, backups)
3. Feedback is immediate and calm
4. Recovery is obvious
5. Power options exist under Advanced without polluting the default

If a screen would make sense in Dokploy’s “add a resource” catalog, rewrite it until it feels like Railway’s “here’s your project — Deploy.”
