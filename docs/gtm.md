# GTM readiness — launch bar

Canonical gate for a **public v1 launch**. Competitive context: Coolify/Dokploy win breadth; deplow wins an opinionated Railway-shaped loop with gVisor. Do **not** gate launch on feature parity with them.

Related: [sequencing.md](./sequencing.md) · [product.md](./product.md) · [access.md](./access.md) · [goal.md](./goal.md)

## Positioning (locked)

| Win | Lose on purpose |
| --- | --- |
| Sandboxed app + Postgres + Redis + S3 on one host | Compose catalogs, 300+ templates, MySQL/Mongo menu |
| gVisor by default | Multi-server / Swarm fleets |
| Wildcard URL via Caddy + cloudflared | Custom domains (v2), Let’s Encrypt on Caddy |
| Git push-to-deploy (GitHub/GitLab) | Enterprise SSO / fine-grained RBAC |

**Sales line:** We are Railway-shaped, not Coolify-shaped. If you need Compose + templates + Swarm, use them. If you want sandboxed app+PG+Redis+S3 with git push, use us.

## Launch happy path (must be boring)

An operator must complete this **without reading more than one page** ([prerequisites](../apps/site/src/content/docs/docs/getting-started/prerequisites.md) + [quick start](../apps/site/src/content/docs/docs/getting-started/quick-start.md)):

```text
bash scripts/install.sh
  → pnpm dev → create user
  → Domains: set base domain + auto subdomains
  → (optional) cloudflared edge for https://*.baseDomain
  → create project → add web + data services → bind
  → connect GitHub/GitLab → deploy
  → open https://{slug}.{baseDomain} (or Host curl locally)
  → live logs → backup → destroy cleans up
  → failed deploy is obvious in UI (retry / rollback)
```

### Must be true at launch

- [ ] `scripts/install.sh` installs/verifies BuildKit, Railpack, and gVisor (or exits with actionable failure)
- [ ] User app containers actually use `runsc` when required
- [ ] Credentials flow through **bindings** (not tribal knowledge)
- [ ] Git webhook auto-registers; signature-verified push deploys production branch
- [ ] Marketing/docs match code: **service-first** create, **Cloudflare TLS** (not Caddy Let’s Encrypt), **no CLI**, **wildcard-only domains in v1**
- [ ] Destroy tears down containers, proxy routes, and data services

### Need not be true at v1 launch

- PR preview environments (v2)
- Custom domains / Caddy ACME (v2)
- Multi-node / SSH remotes (v3)
- Templates, Compose deploy, MySQL/Mongo
- Enterprise SSO / fine-grained RBAC / public REST API / CLI
- Metrics dashboards, browser terminal
- Full notification matrix (Slack/Discord/Telegram/…)

## Decisions locked for GTM

### Domains: wildcard-only in v1

**Decision:** Do **not** pull custom domains into v1. Market ruthlessly as platform subdomain URLs under `*.{baseDomain}` via cloudflared. Schema keeps `kind=custom` reserved for v2.

**Honest TLS story:** Caddy is HTTP-only on the host; TLS terminates at Cloudflare (or local `http` for `*.localhost`). Never claim Let’s Encrypt on Caddy in v1.

See [access.md](./access.md).

### Notifications: thin exception

**Decision:** Full notification hubs stay out of scope. For GTM trust, **one** thin path is allowed: operator-configured **HTTPS webhook** on deploy/provision **failure** (and optionally success). No Slack/Discord matrix, no email SMTP product in v1 unless that webhook covers it.

Carve-out lives in [product.md](./product.md). Implementation can follow after the happy path above is reliable; absence of the webhook must not block “install → URL” but should be tracked as a soft launch gap.

### Installer

**Decision:** `bash scripts/install.sh` is the near-one-command bootstrap. It must prefer installing gVisor over silently falling back to runc.

## Sequencing after launch bar is green

1. Keep docs/marketing aligned (no drift regressions)
2. Thin failure webhook (if not already shipped)
3. v2: custom domains + previews
4. Never chase templates/Compose/multi-DB as a Coolify response

## Anti-checklist (do not delay launch for these)

- Matching Dokploy/Coolify feature matrices
- MCP as a marketing lead (tokens may exist; don’t oversell)
- Enterprise SSO packaging
- Multi-server placement UI
