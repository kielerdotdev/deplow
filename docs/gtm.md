# GTM readiness — launch bar

Canonical gate for a **public v1 launch**. Competitive context: Coolify/Dokploy win breadth; Hostrig wins an opinionated Railway-shaped loop with gVisor on k3s. Do **not** gate launch on feature parity with them.

Related: [sequencing.md](./sequencing.md) · [product.md](./product.md) · [access.md](./access.md)

## Positioning (locked)

| Win | Lose on purpose |
| --- | --- |
| Sandboxed app + Postgres + Redis + S3 on **k3s** | Compose catalogs, 300+ templates, MySQL/Mongo menu |
| gVisor RuntimeClass by default (honest limits) | MicroVMs / Kata / “completely secure” claims |
| Wildcard URL via Traefik + edge (Cloudflare / Netbird / Tailscale) | Custom domains kitchen sink (v2) |
| Git push-to-deploy (GitHub/GitLab) | Enterprise SSO / fine-grained RBAC |
| Add Hetzner or self-hosted k3s workers | Autoscaling, Docker-agent remotes |
| Web + MCP + thin CLI (same backend) | Desktop app, public REST productization, mail server |

**Sales line:** We are Railway-shaped, not Coolify-shaped. User apps are sandboxed with gVisor by default on k3s — stricter than Railway’s public plain-container deploy story, without claiming Dirty Pipe immortality. If you need Compose + templates, use Coolify. If you want sandboxed app+PG+Redis+S3 on k3s with git push, use us.

## Launch happy path (must be boring)

An operator must complete this **without reading more than one page** ([prerequisites](../apps/site/src/content/docs/docs/getting-started/prerequisites.md) + [quick start](../apps/site/src/content/docs/docs/getting-started/quick-start.md)):

```text
bash scripts/install.sh
  → pnpm dev → create user
  → Settings → Cluster: connect or create k3s
  → Domains: set base domain + edge (Cloudflare / Netbird / Tailscale)
  → create project → add web + data services → bind
  → deploy → open https://{slug}.{baseDomain}
  → (optional) add Hetzner or self-hosted worker
  → live logs → backup → destroy cleans up
  → failed deploy is obvious in UI (retry / rollback)
```

### Must be true at launch

- [ ] Cluster nodes have gVisor (`runsc`) — managed Hetzner cloud-init, self-hosted join script, or `scripts/install-gvisor-k3s.sh`
- [ ] User app pods always use `runtimeClassName: gvisor` (no runc escape hatch)
- [ ] Project namespaces get NetworkPolicy isolation + hardened pod securityContext
- [ ] Credentials flow through **bindings**
- [ ] Git webhook auto-registers; signature-verified push deploys production branch
- [ ] Marketing/docs match code: **service-first**, **k3s + Traefik + gVisor**, edge TLS, **no Docker-agent for apps**, **wildcard-only domains in v1**
- [ ] Docs never say “Secure by default” as a blank check; they name gVisor and operator patch duty
- [ ] Destroy tears down workloads, ingress, and data services

### Need not be true at v1 launch

- PR preview environments (v2)
- Custom domains / ACME on Traefik (v2)
- Autoscaling
- Templates, Compose deploy, MySQL/Mongo
- Enterprise SSO / fine-grained RBAC / general-purpose public REST API
- Desktop app (**never**)
- Full CLI feature parity with the web panel (thin client is enough)
- Metrics dashboards, browser terminal
- Full notification matrix (Slack/Discord/Telegram/…)
- MicroVMs / Kata / Firecracker

## Decisions locked for GTM

### Domains: wildcard-only in v1

**Decision:** Do **not** pull custom domains into v1. Market as platform subdomain URLs under `*.{baseDomain}` via edge → Traefik. Schema keeps `kind=custom` reserved for v2.

**Honest TLS story:** Traefik is HTTP-only in-cluster for this ship slice; TLS terminates at Cloudflare / Netbird / Tailscale. Never claim Let’s Encrypt on Traefik in v1.

See [access.md](./access.md).

### Notifications: thin exception

**Decision:** Full notification hubs stay out of scope. For GTM trust, **one** thin path is allowed: operator-configured **HTTPS webhook** on deploy/provision **failure** (and optionally success). No Slack/Discord matrix, no email SMTP product in v1 unless that webhook covers it.

Carve-out lives in [product.md](./product.md).

### Installer / cluster sandbox

**Decision:** Control-plane bootstrap stays easy; **cluster nodes** must get gVisor. Managed Hetzner userdata and the self-hosted worker join script install `runsc` before/with k3s. BYO clusters use `scripts/install-gvisor-k3s.sh`. Never fall back to unsandboxed pods — runc is not allowed for user apps.

**Not the launch bar:** “install Docker gVisor for local containers” or Docker-agent install for app deploy.

## Sequencing after launch bar is green

1. Keep docs/marketing aligned (no drift regressions)
2. Thin failure webhook — shipped (System → Notifications)
3. v2: custom domains + previews
4. Never chase templates/Compose/multi-DB as a Coolify response

## Interfaces (locked)

| Surface | GTM role |
| --- | --- |
| **Web** | Primary operator path; launch bar is UI-complete |
| **MCP** | Same lifecycle for agents; do not oversell as the lead story |
| **CLI** | Thin remote client on operator PATs; claim only after `login` + deploy/status work |
| **Desktop** | Never |

## Anti-checklist (do not delay launch for these)

- Matching Dokploy/Coolify feature matrices
- Shipping thin CLI before launch bar is green (nice-to-have polish)
- MCP as the only marketing lead (tokens may exist; don’t oversell)
- Enterprise SSO packaging
- Autoscaling / placement UI
- MicroVM support
- Desktop, mail server, hybrid multi-tenant cloud
