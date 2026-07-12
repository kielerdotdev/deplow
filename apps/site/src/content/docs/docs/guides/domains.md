---
title: Domains & URLs
description: Platform wildcard URLs via Caddy and Cloudflare Tunnel. Custom domains are v2.
---

deplow owns the local reverse proxy (**Caddy**). Edges only forward HTTP with the `Host` header intact. In v1 every web service gets a hostname under your **platform base domain** — not an arbitrary custom domain.

## Happy path

1. Open **Domains** in the dashboard.
2. Set **base domain** (e.g. `apps.example.com` or `apps.localhost`), protocol (`https` or `http`), enable auto-assign subdomains.
3. For public HTTPS: create a Cloudflare Tunnel. Public hostname `*.apps.example.com` → service `http://caddy:80`.
4. Point a **wildcard** DNS CNAME at the tunnel once (proxied).
5. Start the edge profile:

```bash
export CLOUDFLARE_TUNNEL_TOKEN=...
docker compose --profile edge up -d
```

Primary web URL: `https://{project}.{baseDomain}`  
Extra web services: `https://{project}-{service}.{baseDomain}`  
Workers / Postgres / Redis: no public hostname.

## Origins

| From              | URL                         |
| ----------------- | --------------------------- |
| Compose network   | `http://caddy:80`           |
| Host              | `http://127.0.0.1:8088`     |

Local check without the tunnel:

```bash
curl -H "Host: acme.apps.example.com" http://127.0.0.1:8088/
```

## TLS

Caddy on the host is **HTTP-only** (`auto_https off`). TLS terminates at **Cloudflare** on the tunnel. There is no Let’s Encrypt on Caddy in v1.

## What is not v1

- **Custom domains** (`www.customer.com`) — schema reserved; UI in v2
- **PR preview URLs** — v2
- Publishing Postgres/Redis through the proxy — never

`DEPLOW_BASE_DOMAIN` / `DEPLOW_PUBLIC_URL_PROTOCOL` only **seed** the Domains settings on first boot. After that, change domains in the UI.

Canonical detail: repo `docs/access.md`.
