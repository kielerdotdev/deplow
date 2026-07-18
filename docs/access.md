# Access, proxy & public URLs

How people reach apps on **k3s**. Sequencing: [sequencing.md](./sequencing.md).

## Dictating rule

**Traefik (k3s Ingress) owns Host → Service.** Edges only forward. There is no product path that opens Traefik on a public IP or sslip.io.

```text
Client
  → Cloudflare Tunnel / Netbird RP / Tailscale Serve
      → Traefik (:80 on the k3s server, usually 127.0.0.1)
          → Service → Pod (gVisor for user apps)
```

| Layer | Owner | Job |
| ----- | ----- | --- |
| **Ingress settings** | Domains UI / `platform_ingress` | Base domain, protocol, edge mode |
| **Hostnames** | `service_hostnames` + Ingress | auto `{slug}.{baseDomain}` |
| **Proxy** | Traefik Ingress | Host → ClusterIP Service |
| **Edge** | Operator on k3s server | TLS + path from clients to Traefik |
| **Cluster** | Settings → Cluster | BYO kubeconfig or Hetzner cloud-init; add workers |

## Cluster create & capacity

| Path | When | Cost risk |
| ---- | ---- | --------- |
| **BYO kubeconfig** | Paste kubeconfig | None from Hostrig |
| **Create on Hetzner** | `HOSTRIG_HETZNER_API_TOKEN` | One VM (cloud-init k3s + gVisor) |
| **Add Hetzner worker** | Connected cluster + token | Extra CPX-class VM |
| **Add self-hosted worker** | Connected cluster + stored node token | Your hardware; join script from UI |

**Not in product:** Docker-agent remotes or the hetzner-k3s CLI.

1. Connect or create a cluster (Settings → Cluster) with Traefik detected.
2. Grow capacity with **Add Hetzner worker** or **Add self-hosted worker** (copyable k3s agent + gVisor install script).
3. Prefer **NetBird guided setup** (Settings → Networking) or set a real base domain + Cloudflare / Tailscale (recipes below).
4. Traefik origin on the node is normally `http://127.0.0.1:80` (override with `HOSTRIG_TRAEFIK_ORIGIN` only if you host Traefik elsewhere).

### NetBird guided (happy path)

1. In NetBird: create a **Personal Access Token** (Settings → Personal Access Tokens).
2. In Hostrig → Networking → **NetBird guided setup**:
   - Management URL: `https://api.netbird.io` (cloud) or your self-hosted URL.
   - Paste the PAT.
   - Domain: **NetBird-managed** or **custom**.
3. **Connect** — agent appears as peer `hostrig-k3s` in NetBird; Domains switch to NetBird.
4. Deploy a web service — Hostrig upserts a NetBird RP service for `{slug}.{baseDomain}`.

Disconnect removes the agent + origin DaemonSets, revokes the setup key (best-effort), and deletes mapped RP services.

### Other edge recipes

**Cloudflare Tunnel** — public hostname `*.apps.example.com` → HTTP service `http://127.0.0.1:80` on the server running cloudflared (must reach Traefik).

**Tailscale Serve** (on the k3s server):

```bash
tailscale serve --bg http://127.0.0.1:80
```

Clients use the Tailnet HTTPS name; Traefik still matches on the `Host` header for `{slug}.{baseDomain}`.

### Laptop check (from a host that can hit Traefik)

```bash
curl -H "Host: acme.apps.example.com" http://127.0.0.1:80/
```

## What Hostrig does not own

- Public IP + sslip / raw LoadBalancer dogfood as the happy path
- cert-manager on Traefik (TLS stays at the edge for this ship slice)
- Being a general ingress controller UI
- Public Postgres/Redis endpoints
- Docker-agent / mesh hairpin as the app runtime
