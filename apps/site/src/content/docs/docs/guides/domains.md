---
title: Domains & URLs
description: Platform wildcard hostnames, edge TLS, and Traefik on k3s.
---

**Traefik (k3s Ingress) owns Host → Service.** Edges only forward HTTP with the `Host` header intact. Domains are configured in the app (**Settings → Networking & domains**).

```text
Client
  → Cloudflare Tunnel / NetBird reverse proxy / Tailscale Serve
      → Traefik (:80 on the k3s server, usually 127.0.0.1)
          → Service → Pod (gVisor for user apps)
```

## v1 hostname scheme

| Service | Hostname |
| --- | --- |
| Primary web service | `{project}.{baseDomain}` |
| Additional web services | `{project}-{service}.{baseDomain}` |
| Workers, Postgres, Redis | **not** published via Traefik |

**Custom domains are v2** (schema may reserve `kind=custom`; do not expect the feature in v1).

## Setup

1. **Settings → Cluster** — cluster connected, Traefik detected.
2. **Networking & domains** — set base domain (e.g. `apps.example.com`), protocol `https`, enable auto-assign subdomains.
3. Point an edge at Traefik on the k3s server (default origin `http://127.0.0.1:80`, override with `HOSTRIG_TRAEFIK_ORIGIN` only if needed).

`HOSTRIG_BASE_DOMAIN` / `HOSTRIG_PUBLIC_URL_PROTOCOL` only **seed** Domains on first boot. Day-to-day changes are in the UI.

## Edge recipes

### NetBird guided

1. Create a NetBird Personal Access Token.
2. Hostrig → Networking → **NetBird guided setup** — management URL + PAT + domain mode.
3. Connect — agent peer appears; Domains switch to NetBird mode.
4. Deploy a web service — Hostrig can upsert reverse-proxy mappings for `{project}.{baseDomain}`.

### Cloudflare Tunnel

Public hostname `*.apps.example.com` → HTTP service `http://127.0.0.1:80` on a host that can reach Traefik (often the k3s server). Optional compose `edge` profile with `CLOUDFLARE_TUNNEL_TOKEN` on the control-plane host when that host can reach Traefik.

### Tailscale Serve

On the k3s server:

```bash
tailscale serve --bg http://127.0.0.1:80
```

Clients use Tailnet HTTPS; Traefik still matches on the `Host` header for `{project}.{baseDomain}`.

## TLS story (honest)

- **TLS terminates at the edge**
- Traefik is **HTTP-only** in-cluster for this ship slice
- Do **not** expect Let’s Encrypt on Traefik in v1
- Do **not** expect public-IP + sslip.io dogfood as the happy path

## Laptop check

From a host that can hit Traefik:

```bash
curl -H "Host: {project}.{baseDomain}" http://127.0.0.1:80/
```
