---
title: Deploy modes
description: Prebuilt images, Dockerfile builds, and Railpack — the three supported paths.
---

deplow supports exactly three deploy paths. The builder picks one based on your deployment input.

## 1. Prebuilt image

Provide a registry image reference (e.g. `nginx:alpine`, `ghcr.io/org/app:tag`). deplow pulls the image and runs it with project env injected.

**Use when:** you already publish container images from CI.

## 2. Dockerfile

If the source tree contains a `Dockerfile`, deplow runs `docker build` (via BuildKit) and tags the result as `deplow/<slug>:<deploymentId>`.

**Use when:** you have an existing container build definition.

## 3. Railpack (default for source)

If there is no `Dockerfile`, deplow invokes Railpack:

```bash
railpack build --name deplow/<slug>:<deploymentId> <source>
```

**Use when:** you want zero-config builds from source — the primary happy path.

## Build selection logic

```text
if image provided     → pull & run
else if Dockerfile    → docker build → run
else                  → railpack build → run
```

## Not supported

- **Docker Compose** as a deploy target
- **Nixpacks / Paketo / Heroku buildpacks**
- **Remote builders** or multi-host orchestration

Compose-related code paths may exist as stubs but are intentionally rejected.
