---
title: Deploy modes
description: Prebuilt images, Dockerfile builds, and Railpack — the three supported paths.
---

Hostrig supports exactly three deploy paths for **web** and **worker** services.

## 1. Prebuilt image

Provide a registry image reference (e.g. `nginx:alpine`, `ghcr.io/org/app:tag`). Hostrig pulls the image (using registry credentials when configured) and runs it with **bound** env injected.

**Use when:** you already publish container images from CI.

## 2. Dockerfile

When you opt into Dockerfile builds (or select a Dockerfile path), Hostrig runs a BuildKit-backed `docker build`, tags the result, **pushes to the default build registry**, and deploys that tag on k3s.

**Use when:** you have an existing container build definition.

## 3. Railpack (default for source)

For source deploys without a forced Dockerfile strategy, Hostrig invokes **Railpack** (Railway’s zero-config builder), pushes the image to the default build registry, and deploys on k3s.

**Use when:** you want zero-config builds from a git repo — the primary source happy path.

## Build selection logic

```text
if image provided                 → pull & run
else if Dockerfile strategy       → docker build → push registry → run
else                              → railpack build → push registry → run
```

**Git / source builds require Settings → Registries** with a default build registry. Without it, the control plane can build but cannot hand k3s a pullable image reference.

## Not supported

- **Docker Compose** as a deploy target
- **Nixpacks / Paketo / Heroku buildpacks** (Railpack only)
- **Remote builders** or multi-host Docker swarm orchestration
- **In-cluster Kaniko** as the default (planned later; builds run on the control plane today)

## Runtime after build

Regardless of build path, **user app pods** use gVisor RuntimeClass when `DEPLOW_APP_RUNTIME=runsc` (default). Builds themselves use runc/BuildKit — not gVisor.
