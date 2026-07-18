# Security

Security is **highly regarded** — not a later hardening pass. It ranks above easy install and performance. See [philosophy.md](./philosophy.md).

This document is the **stance**. Implementation of the app sandbox is [secure-runtime.md](./secure-runtime.md).

## Priority order

```text
security  >  easy install  >  decent performance
```

User apps **always** use gVisor. There is **no** `HOSTRIG_APP_RUNTIME=runc` escape hatch. Images that cannot run under gVisor must be fixed (or use a writable rootfs only via `HOSTRIG_APP_READONLY_ROOTFS=false` where needed).

## Threat model (v1, k3s)

Hostrig runs **untrusted user application pods** on the same k3s cluster as project data services (Postgres, Redis) and cluster ingress (Traefik). The control plane typically runs outside the cluster.

We assume:

- The host/cluster operator trusts the control plane and platform/system workloads
- User app images and source are **not** fully trusted
- A compromised user app must not easily become node root, reach the kubelet credentials, or freely attack sibling **projects** beyond what NetworkPolicy allows

We do **not** claim: multi-tenant hostile SaaS isolation, formal certification, MicroVM-level (Kata/Firecracker) guarantees, or Dirty Pipe / host-kernel immortality. Soft organizations share the cluster trust boundary. **gVisor RuntimeClass** is the chosen userspace sandbox for v1 user apps — say that out loud; never sell “completely secure.”

## Non-negotiable defaults

| Rule | Detail |
| --- | --- |
| **User apps → gVisor (`runtimeClassName: gvisor`)** | **Always** — runc is not allowed for user apps |
| **Platform / data → default runtime** | Postgres, Redis, Traefik stay on runc/containerd |
| **Builds → runc** | Railpack / BuildKit / `docker build` are not forced under gVisor |
| **No Docker socket in user apps** | Never mount docker.sock (or host paths) into project pods |
| **No host network for user apps** | Cluster networking only |
| **Hardened pod/container securityContext** | Non-root, drop ALL caps, no privilege escalation, RuntimeDefault seccomp, RO rootfs (+ `/tmp` emptyDir), memory/CPU limits |
| **NetworkPolicy per project namespace** | Default-deny east-west; Traefik ingress only; DNS + same-ns; public HTTP/S egress excludes link-local/RFC1918 |
| **No SA token on user apps** | `automountServiceAccountToken: false` on web/worker pods |
| **ResourceQuota per project namespace** | Caps pods/CPU/memory/PVCs (tunable via `HOSTRIG_NS_QUOTA_*`) |
| **Secrets encrypted at rest** | Project credentials via AES-GCM (`HOSTRIG_SECRETS_KEY` / auth secret) |
| **Data plane not public by default** | Postgres / Redis are for the app + private operator access — not internet listeners as a product feature |
| **Proxy is platform; apps stay sandboxed** | Traefik / edge is trusted platform infra; user apps remain gVisor-isolated — [access.md](./access.md) |

Full RuntimeClass and install steps: [secure-runtime.md](./secure-runtime.md).

## What marketing and user docs must say

**Allowed / required framing:**

- Self-hosted on **k3s**, with **sandboxed user apps** (gVisor by default)
- Dedicated Postgres / Redis per project namespace; shared MinIO with per-project buckets
- Encrypted secrets and injected env — no secrets left as plain DB columns in the happy path
- Security over convenience when those conflict
- **Wildcard base domain + Traefik**; edge TLS via Cloudflare / Netbird / Tailscale

**Disallowed framing:**

- “Secure by default” without naming gVisor and the operator trust boundary
- Implying Hostrig is “just plain pods” or still a Docker-host + Caddy product
- Advertising Kata or Firecracker as ours (unsupported)
- Softening “gVisor required by default” into optional trivia buried in an appendix
- Claiming multi-tenant cloud-grade, MicroVM, or unbreakable isolation
- Implying Postgres/Redis are published through the app proxy

The landing page can stay human and short. It must not contradict this file. Prefer one honest line (e.g. user apps run under gVisor on k3s) over silence.

## Operator responsibilities

Hostrig hardens the **app runtime** and owns **hostname → Service** ingress routing. The operator still must:

- Keep k3s nodes and the host patched
- Install gVisor (`runsc`) on every node (`scripts/install-gvisor-k3s.sh` or managed cloud-init)
- Protect kubeconfig and the control plane
- Choose strong `BETTER_AUTH_SECRET` / `HOSTRIG_SECRETS_KEY`
- Treat the **cluster nodes** as the trust boundary
- Configure DNS wildcard + edge TLS; keep Postgres/Redis off the public internet

## Out of scope (security work we are not doing in v1)

- Kata, Firecracker, Sysbox as default
- Sandboxing Postgres/Redis/MinIO under gVisor
- Running builds under gVisor
- Hostile multi-tenant SaaS guarantees

When blocked on an image that cannot run under gVisor, fix the image (non-root, compatible syscalls). Do not disable gVisor.
