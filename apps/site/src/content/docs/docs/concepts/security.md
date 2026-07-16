---
title: Security
description: gVisor defaults, hardened containers, encrypted secrets, and operator responsibilities.
---

Security is a first-class product feature in Hostrig — not an optional appendix. Priority order: **security → easy install → decent performance**.

## What Hostrig hardens

| Layer                 | Behavior                                                                              |
| --------------------- | ------------------------------------------------------------------------------------- |
| **User apps**         | Run under **gVisor (`runsc`)** by default                                             |
| **Data services**     | Dedicated Postgres/Redis containers stay on ordinary **runc**                         |
| **Platform glue**     | MinIO, Caddy, BuildKit, platform Redis (BullMQ) on **runc**                           |
| **Builds**            | Railpack / BuildKit / `docker build` use runc (not gVisor)                            |
| **HostConfig**        | CapDrop ALL, `no-new-privileges`, readonly rootfs (+ `/tmp` tmpfs), memory/CPU limits |
| **Docker socket**     | Available to the control plane only — **never** mounted into user apps                |
| **Secrets**           | Project credentials encrypted at rest (AES-GCM)                                       |

## Why gVisor

User app images and source are not fully trusted. gVisor provides a userspace syscall sandbox so a compromised app is harder to turn into host root. This is the v1 default — not microVMs (Kata/Firecracker), which are out of scope.

## Operator checklist

1. Install Docker Engine and **gVisor** (`runsc`) — see [Prerequisites](/docs/getting-started/prerequisites/)
2. Prefer `userns-remap: default` on the Docker daemon
3. Keep `DEPLOW_APP_RUNTIME=runsc` (default) and `DEPLOW_APP_RUNTIME_REQUIRED=true` in production
4. Set strong `BETTER_AUTH_SECRET` / `DEPLOW_SECRETS_KEY`
5. Do not expose `docker.sock` to untrusted processes

## Escape hatch

If an image cannot run under gVisor, set `DEPLOW_APP_RUNTIME=runc` temporarily. This logs a warning and weakens isolation — fix the image or opt out per environment; do not treat runc as the marketed default.

## What we do not claim

- Multi-tenant hostile SaaS isolation on a shared public cloud
- Formal certification or microVM-level guarantees
- Sandboxing of Postgres/Redis/MinIO under gVisor

Contributor-facing detail lives in the repository: `docs/security.md` and `docs/secure-runtime.md`.
