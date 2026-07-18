---
title: Prerequisites
description: What you need on the control-plane host and on every k3s node before running Hostrig.
---

Hostrig has two machines-worth of requirements (they can be the same box):

1. **Control plane host** — Docker Compose runs the web app, platform Redis, BuildKit, and (by default) MinIO.
2. **k3s cluster** — apps and project Postgres/Redis schedule here. User apps need **gVisor** (`runsc`) on every node.

## VPS / production

```bash
curl -sSL https://github.com/kielerdotdev/deplow/releases/download/install/install.sh | sudo bash
```

Private repo / before the release asset exists:

```bash
sudo bash deploy/install.sh
```

| Requirement | Notes |
| --- | --- |
| **Docker Engine** | Compose v2 for the control plane; socket used for builds (BuildKit) and image pull |
| **k3s cluster** | BYO kubeconfig **or** create via Settings → Cluster (Hetzner cloud-init) |
| **gVisor on nodes** | RuntimeClass `gvisor` for user apps — see below |
| **BuildKit** | Started by the installer as the `buildkit` container |
| **Object storage** | **Bundled MinIO** by default (`DEPLOW_BUNDLE_MINIO=1`). Or set `DEPLOW_BUNDLE_MINIO=0` and provide external `DEPLOW_S3_*` (MinIO/R2) |
| **Container registry** | Required for **git / Railpack / Dockerfile** builds — configure under Settings → Registries after install |

You do **not** need Node, pnpm, or Railpack on the host for production (they ship in the control-plane image). Supported image architecture today: **linux/amd64**.

## gVisor setup (k3s nodes)

User application **pods** run under **gVisor** by default (`DEPLOW_APP_RUNTIME=runsc` → Kubernetes RuntimeClass `gvisor`). Postgres/Redis and system workloads stay on the default containerd runtime.

| Cluster path | gVisor install |
| --- | --- |
| **Managed Hetzner** (create / add worker) | cloud-init installs `runsc` |
| **Self-hosted worker** (Cluster UI join script) | join script installs gVisor + k3s agent |
| **BYO kubeconfig** | Run on **every** server and agent node: |

```bash
sudo bash scripts/install-gvisor-k3s.sh
kubectl get runtimeclass gvisor
```

If the RuntimeClass is missing and `DEPLOW_APP_RUNTIME_REQUIRED` is true (default), deploys **fail with a clear error** rather than silently falling back. Escape hatch: `DEPLOW_APP_RUNTIME=runc` (not sandboxed — not for production defaults).

## Public URLs (Traefik + edge)

**Traefik on k3s** owns Host → Service. **Domains** are configured in the app (Networking & domains). Edges only forward to Traefik (usually `http://127.0.0.1:80` on the k3s server).

**v1 is wildcard-only:** every web service gets a hostname under `*.{baseDomain}`. Custom domains are **v2**. **TLS terminates at the edge**; Traefik stays HTTP-only in-cluster for this ship slice.

Postgres and Redis are **never** exposed through the proxy.

## Platform services (control plane)

Compose runs control-plane glue — **not** your app runtime:

| Service | Role |
| --- | --- |
| **web** | Control plane (TanStack Start) |
| **platform Redis** | BullMQ queues |
| **BuildKit** | Source / Dockerfile builds |
| **MinIO** (optional bundle) | Platform S3 for backups and project buckets |

**Apps, Postgres, and Redis** run as Kubernetes workloads on your **k3s** cluster after you connect it.

## What you do not need

- A separate hosted Postgres / Redis / S3 account per app
- Swarm, Docker-agent remotes, or SSH mesh as the app runtime
- Node.js on the VPS for production installs
- Per-project DNS records (one wildcard → edge is enough)
- Custom domains kitchen sink in v1
- MicroVMs / nested virtualization as an install prerequisite
- Kubernetes expertise beyond “connect kubeconfig / run join script”

## Development

Local development is **Dev Container only** (see [Development](/docs/getting-started/development/)). Do not treat host `pnpm install` / `pnpm dev` as the supported path.
