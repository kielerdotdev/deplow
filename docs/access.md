# Access, proxy & public URLs

How people reach apps and data. **When:** [sequencing.md](./sequencing.md). Security: [security.md](./security.md). Linking: [data-plane.md](./data-plane.md).

## Dictating rule

**deplow owns the local reverse proxy. v1 edge is cloudflared.** Other edges later.

The magic UX: point `*.apps.example.com` at cloudflared **once**, then every new project gets a hostname without touching DNS again.

```text
Internet
    → cloudflared (v1 edge)
        → deplow proxy  (Host: {slug}.apps.example.com → container)
            → user app (gVisor)
```

- **Proxy (ours):** hostname → sandboxed container
- **Edge (v1):** Cloudflare Tunnel / cloudflared
- **DNS (operator, once):** wildcard → cloudflared

We are **not** a kitchen-sink ingress controller. We **are** “give this project a URL under the platform base domain.”

## Lanes

| Lane             | v1                                            | Later                                      |
| ---------------- | --------------------------------------------- | ------------------------------------------ |
| **App HTTP**     | `{slug}.{baseDomain}` via proxy + cloudflared | Same; more edge adapters                   |
| **Preview HTTP** | **Not built** — reserve hostname scheme       | `pr-{n}-{slug}.{baseDomain}` (v2)          |
| **Data plane**   | Private on the node                           | Still private; never through the app proxy |

## Git

| Feature                                             | When                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| **Webhooks** (push → deploy main / production slot) | **v1 must**                                                           |
| **Preview deployments**                             | **v2** — design slots + routes now ([data-plane.md](./data-plane.md)) |

## What deplow owns (v1)

- Local reverse proxy in front of user app containers
- Platform base domain + per-project production subdomain
- cloudflared edge integration (tunnel config / ingress to proxy)
- Proxy updates on deploy/destroy
- Copyable project URL in the UI

## What comes later (v2+)

- Preview routes and lifecycle
- Tailscale Serve / Netbird / direct TLS adapters
- Custom domains beyond the wildcard

## What deplow does not own

- Being Cloudflare (we integrate the tunnel)
- Per-project DNS as the happy path
- Public Postgres/Redis endpoints
- Browser terminals or database GUIs

## Security boundary

- User apps stay on gVisor; proxy is **platform** infra
- Data stores stay on the private platform network
- Tunnel tokens encrypted like other platform secrets

## Messaging

**v1:** “Point a wildcard at cloudflared once; every project gets a URL. Git push to deploy.”

**Not v1:** PR preview URLs (roadmap only until v2).
