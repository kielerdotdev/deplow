---
title: Security
description: gVisor on k3s, hardened pods, NetworkPolicy, encrypted secrets, and operator responsibilities.
---

Security is a first-class product feature — not an optional appendix. Priority order: **security → easy install → decent performance**.

## What Hostrig hardens

| Layer | Behavior |
| --- | --- |
| **User apps** | Pods use **gVisor** (`runtimeClassName: gvisor`) when `DEPLOW_APP_RUNTIME=runsc` |
| **Data services** | Postgres/Redis stay on the default containerd runtime |
| **Platform** | Traefik and system pods on the default runtime |
| **Builds** | Railpack / BuildKit use runc (not gVisor) |
| **Pod hardening** | Non-root, drop ALL caps, no privilege escalation, RO rootfs, CPU/memory limits |
| **Network** | Per-project NetworkPolicy (default-deny across projects) |
| **Secrets** | Project credentials encrypted at rest (AES-GCM) |
| **Socket** | Docker socket / host paths never enter user pods |

## Why gVisor

User app images and source are not fully trusted. gVisor provides a userspace syscall sandbox so a compromised app is harder to turn into node root. This is the only supported sandbox in v1 — not MicroVMs (Kata/Firecracker).

Typical host-kernel bugs in the Dirty Pipe / Dirty COW class are much harder to land against gVisor apps because those syscalls are handled in the Sentry, not the host implementation. That is **not** a promise of immortality: we do not claim unbreakable isolation or that no CVE can ever matter.

## Operator checklist

1. Connect a **k3s** cluster (BYO kubeconfig or managed Hetzner)
2. Install **gVisor** on every node — managed cloud-init / join script does this; BYO: `scripts/install-gvisor-k3s.sh`
3. Keep `DEPLOW_APP_RUNTIME=runsc` (default) and `DEPLOW_APP_RUNTIME_REQUIRED=true` in production
4. Set strong `BETTER_AUTH_SECRET` / `DEPLOW_SECRETS_KEY`
5. Protect kubeconfig and MCP tokens; patch nodes; do not expose Postgres/Redis publicly
6. Terminate TLS at a trusted edge; do not open Traefik as a naked public HTTP origin without understanding the risk

## Escape hatch

If an image cannot run under gVisor, set `DEPLOW_APP_RUNTIME=runc` temporarily. This logs a warning and weakens isolation — fix the image; do not treat runc as the marketed default.

## What we do not claim

- “Completely secure” or unbreakable isolation
- Multi-tenant hostile SaaS isolation on a shared public cloud
- Formal certification or MicroVM-level guarantees
- Sandboxing of Postgres/Redis under gVisor
- That MCP tokens are scoped least-privilege (they are **operator PATs** — full power for the account)

Contributor-facing detail lives in the repository: `docs/security.md` and `docs/secure-runtime.md`.
