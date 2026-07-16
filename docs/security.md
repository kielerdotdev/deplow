# Security

Security is **highly regarded** — not a later hardening pass. It ranks above easy install and performance. See [philosophy.md](./philosophy.md).

This document is the **stance**. Implementation of the app sandbox is [secure-runtime.md](./secure-runtime.md).

## Priority order

```text
security  >  easy install  >  decent performance
```

Escape hatches (e.g. `DEPLOW_APP_RUNTIME=runc`) exist for broken images. They are temporary and must log warnings. Defaults stay secure.

## Threat model (v1, single host)

Hostrig runs **untrusted user application containers** on the same Docker host as the control plane and shared data plane (Postgres, Redis, MinIO).

We assume:

- The host operator trusts the control plane and platform compose services
- User app images and source are **not** fully trusted
- A compromised user app must not easily become host root, steal `docker.sock`, or freely attack sibling containers beyond what network policy allows

We do **not** yet claim: multi-tenant hostile SaaS isolation, formal certification, or microVM-level guarantees. Soft organizations share the host trust boundary (control-plane membership + per-project containers). gVisor is the chosen userspace sandbox for v1.

## Non-negotiable defaults

| Rule                                       | Detail                                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **User apps → gVisor (`runsc`)**           | Default OCI runtime for deployed user containers                                                           |
| **Platform → runc**                        | Postgres, Redis, MinIO, control plane stay on default runc                                                 |
| **Builds → runc**                          | Railpack / BuildKit / `docker build` are not forced under gVisor                                           |
| **No Docker socket in user apps**          | Never mount `/var/run/docker.sock` into project containers                                                 |
| **No host network for user apps**          | Join the platform network for DNS; no `NetworkMode: host`                                                  |
| **Hardened HostConfig**                    | CapDrop ALL, no-new-privileges, readonly rootfs (+ `/tmp` tmpfs), memory/CPU limits                        |
| **Secrets encrypted at rest**              | Project credentials via AES-GCM (`DEPLOW_SECRETS_KEY` / auth secret)                                       |
| **userns-remap recommended**               | Container root ≠ host root when configured on the daemon                                                   |
| **Data plane not public by default**       | Postgres / Redis are for the app + private operator access — not internet listeners as a product feature   |
| **Proxy is platform; apps stay sandboxed** | Local reverse proxy is trusted platform infra; user apps remain gVisor-isolated — [access.md](./access.md) |

Full HostConfig and install steps: [secure-runtime.md](./secure-runtime.md).

## What marketing and user docs must say

**Allowed / required framing:**

- Self-hosted on your Docker host, with **sandboxed user apps** (gVisor by default)
- Dedicated Postgres / Redis containers per project; shared MinIO with per-project buckets
- Encrypted secrets and injected env — no secrets left as plain DB columns in the happy path
- Security over convenience when those conflict
- **Wildcard base domain + Hostrig proxy**; **v1 edge = cloudflared** (other edges later)

**Disallowed framing:**

- Implying Hostrig is “just Docker run” with no sandbox story
- Advertising rootless Docker, Kata, or Firecracker as the default (out of scope)
- Softening “gVisor required by default” into optional trivia buried in an appendix
- Claiming multi-tenant cloud-grade isolation we do not provide
- Implying Postgres/Redis are published through the app proxy

The landing page can stay human and short. It must not contradict this file. Prefer one honest line (e.g. user apps run under gVisor) over silence.

## Operator responsibilities

Hostrig hardens the **app runtime** and owns **hostname → container** proxy routing. The operator still must:

- Keep Docker Engine and the host patched
- Install gVisor (`runsc`) and prefer `userns-remap`
- Protect `docker.sock` (only the control plane may use it)
- Choose strong `BETTER_AUTH_SECRET` / `DEPLOW_SECRETS_KEY`
- Treat the host as the trust boundary
- Configure DNS wildcard + **cloudflared** (v1) once; keep Postgres/Redis off the public internet

## Out of scope (security work we are not doing in v1)

- Rootless Docker / Podman as default
- Kata, Firecracker, Sysbox
- Sandboxing Postgres/Redis/MinIO under gVisor
- Running builds under gVisor
- Host network / gVisor netstack passthrough as default

When blocked on an image that cannot run under gVisor, document the runc escape hatch — do not weaken global defaults.
