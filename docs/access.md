# Access, proxy & public URLs

How people reach apps and data. **When:** [sequencing.md](./sequencing.md). Security: [security.md](./security.md). Linking: [data-plane.md](./data-plane.md).

## Dictating rule

**deplow owns the local reverse proxy. Edges only forward.** Domains are **app-managed** (Domains tab). Env vars only **seed** settings on first boot.

```text
Internet / VPN
    → edge adapter (cloudflared | Tailscale Serve | Netbird)
        → deplow proxy  (Host → container)
            → user app (gVisor)
```

| Layer | Owner | Job |
| ----- | ----- | --- |
| **Ingress settings** | App UI / `platform_ingress` | Base domain, protocol, auto-domains toggle |
| **Hostnames** | `service_hostnames` | auto (v1), custom + preview (v2+) |
| **Proxy (ours)** | Caddy | hostname(s) → sandboxed container |
| **Edge** | Operator + thin adapter | TLS/VPN terminate; forward HTTP with Host preserved |
| **DNS (operator, once)** | Wildcard → edge | No per-project records for auto domains |

**Stable origins (all edges):**

- Compose network: `http://caddy:80`
- Host: `http://127.0.0.1:8088`

We are **not** a kitchen-sink ingress controller. We **are** “give this project a URL under the platform base domain,” with a hostname table ready for custom domains and previews.

## Lanes

| Lane             | v1                                            | Later                                      |
| ---------------- | --------------------------------------------- | ------------------------------------------ |
| **App HTTP**     | Auto `{slug}.{baseDomain}` via proxy + edge   | Same; custom domains on `service_hostnames` |
| **Preview HTTP** | **Not built** — `kind=preview` reserved       | `pr-{n}-{slug}.{baseDomain}` (v2)          |
| **Data plane**   | Private on the node                           | Still private; never through the app proxy |

## Hostname kinds (`service_hostnames`)

| kind | When | Example |
| ---- | ---- | ------- |
| `auto` | v1 — assigned on web deploy when auto-domains enabled | `acme.apps.example.com` |
| `custom` | **v2 — not GTM v1** — operator-attached domain | `www.customer.com` |
| `preview` | v2 — preview slot | `pr-42-acme.apps.example.com` |

Caddy emits **all active hostnames** for a service into one Host matcher → same upstream. Changing the base domain in the UI rewrites `auto` rows and reloads Caddy.

## App-managed settings

Configure in **Domains** (or `platform.ingressUpdate`):

- **Base domain** — e.g. `apps.example.com`
- **URL protocol** — `https` / `http`
- **Auto-assign subdomains** — when on, web deploys get `{slug}.{baseDomain}`

`DEPLOW_BASE_DOMAIN` / `DEPLOW_PUBLIC_URL_PROTOCOL` seed the DB **once** if no row exists. After that, changing env alone does not change live URLs.

## Git

| Feature                                             | When                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| **Webhooks** (push → deploy main / production slot) | **v1 must**                                                           |
| **Preview deployments**                             | **v2** — design slots + routes now ([data-plane.md](./data-plane.md)) |

## What deplow owns (v1)

- Local reverse proxy in front of user app containers
- App-managed base domain + auto subdomains
- `service_hostnames` rows for auto URLs; multi-host Caddy generation
- cloudflared edge integration (tunnel token still compose/env)
- Proxy updates on deploy/destroy
- Copyable service URL in the UI

## What comes later (v2+)

- Preview routes and lifecycle (`kind=preview`)
- Custom domain attach + verification (`kind=custom`)
- First-class Tailscale Serve / Netbird compose profiles
- Tunnel token in app settings (optional)

## What deplow does not own

- Being Cloudflare (we integrate the tunnel)
- Per-project DNS as the happy path for auto domains
- Public Postgres/Redis endpoints
- Browser terminals or database GUIs

## Hostname map (auto)

With base domain `apps.example.com` and auto-domains on:

| Service | Hostname |
| ------- | -------- |
| Primary web in project `acme` | `acme.apps.example.com` |
| Extra web service `api` | `acme-api.apps.example.com` |
| Worker / Postgres / Redis | no public hostname |

Prefer a dedicated subzone (`apps.example.com`) so `DEPLOW_PUBLIC_URL` (control plane) can use a different hostname.

## Adapter: Cloudflare Tunnel (v1)

1. In the app: set base domain `apps.example.com`, protocol `https`, enable auto-domains.
2. Create a Cloudflare Tunnel (Zero Trust → Networks → Tunnels).
3. Public hostname:
   - **Hostname:** `*.apps.example.com`
   - **Path:** `/`
   - **Service / origin:** `http://caddy:80` (cloudflared must share the compose default network with Caddy — the `edge` profile does this).
4. DNS: CNAME `*.apps.example.com` → `<tunnel-id>.cfargotunnel.com` (proxied).
5. `CLOUDFLARE_TUNNEL_TOKEN=... docker compose --profile edge up -d`.

Caddy stays HTTP-only (`auto_https off`); TLS terminates at Cloudflare.

Local check without the tunnel:

```bash
curl -H "Host: acme.apps.example.com" http://127.0.0.1:8088/
```

## Adapter: Tailscale Serve (later / docs-only)

Same contract: forward to Caddy, preserve Host, do not publish app container ports.

```bash
tailscale serve --bg --https=443 http://127.0.0.1:8088
```

Notes:

- Strongest for a single HTTPS hostname or MagicDNS name. Public `*.baseDomain` wildcards are more natural on Cloudflare Tunnel.
- Do not add a second reverse-proxy layer that rewrites Host.

## Adapter: Netbird (later / docs-only)

Map a Netbird resource / reverse-proxy target to `http://127.0.0.1:8088` (host) or `http://caddy:80` (if on the compose network). Preserve Host so Caddy can route.

## Security boundary

- User apps stay on gVisor; proxy is **platform** infra
- Data stores stay on the private platform network
- Tunnel tokens treated like other platform secrets (compose/env today)

## Messaging

**v1 (locked — [gtm.md](./gtm.md)):** “Set your base domain in the app once; point a wildcard at cloudflared; every project gets `https://{slug}.{baseDomain}`. TLS at Cloudflare; Caddy is HTTP-only.”

**Not v1:** PR preview URLs and **custom domains** (schema ready; UI in v2). Do not market Let’s Encrypt on Caddy or “bring any domain” until custom domains ship.

**Comparison answer:** Coolify/Dokploy attach arbitrary domains with ACME. deplow v1 deliberately ships one wildcard zone so the happy path stays one DNS change.
