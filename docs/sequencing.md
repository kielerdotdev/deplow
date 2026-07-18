# Sequencing

Stop treating every good idea as equal. **Build v1. Design so v2/v3 don’t require a rewrite.** Launch bar: [gtm.md](./gtm.md).

## v1 — ship this (must)

**k3s-backed PaaS:** control plane (TanStack) outside the cluster; apps run only on Kubernetes under gVisor.

| Must | Notes |
| ---- | ----- |
| Service-first stack | Web/worker + postgres/redis + secrets |
| **Cluster** | BYO kubeconfig **or** single-VM Hetzner (cloud-init k3s) |
| **Capacity** | Add Hetzner workers (cloud-init) **or** self-hosted k3s agent join script — no autoscaling |
| Build / run | Prebuilt image **or** git → Railpack/Dockerfile → registry → k3s |
| **Ingress** | Traefik + `{slug}.{baseDomain}`; edge = Cloudflare / Netbird / Tailscale |
| Git webhooks | Push → deploy |
| Ops | Logs, stop, destroy |
| Isolation | User apps → gVisor RuntimeClass; honest limits — [secure-runtime.md](./secure-runtime.md) |

**Not v1:** PR preview deployments, custom domains kitchen sink, MicroVMs, autoscaling.

**v1 done when:** Connect/create cluster → Domains + edge → Whoami → HTTPS URL via edge → Traefik → add a worker (Hetzner or self-hosted) → scale capacity manually.

## v2 — next

| Item | Depends on |
| ---- | ---------- |
| In-cluster Kaniko (replace CP Docker build) | registry already required |
| Preview deployments | hostname scheme + slots |
| Custom domains | `service_hostnames.kind=custom` |
| Hetzner CCM / LB | Traefik Service type LoadBalancer |

## Rules

1. Project workloads live in `proj-{slug}` namespaces; k8s schedules pods.
2. Multi-node = more k3s workers (Hetzner cloud-init or self-hosted join).
3. User apps default to gVisor RuntimeClass; data plane stays on runc — [secure-runtime.md](./secure-runtime.md).
4. Marketing names gVisor; never claim unbreakable / MicroVM-grade isolation.
