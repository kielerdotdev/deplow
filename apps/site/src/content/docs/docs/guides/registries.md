---
title: Container registries
description: Configure the registry Hostrig pushes build images to and k3s pulls from.
---

Git / Railpack / Dockerfile deploys **build** an image, **push** it to a registry, then k3s **pulls** it. Configure registries under **Settings → Registries**.

## When you need one

| Deploy path | Registry needed? |
| --- | --- |
| Prebuilt public image | Usually no |
| Prebuilt private image | Pull credentials |
| Git → Railpack / Dockerfile | Push + pull credentials |

## Tips

- Prefer a registry close to your cluster (GHCR, Docker Hub, or a self-hosted registry).
- Keep credentials in Hostrig — do not bake them into Dockerfiles.
- Platform MinIO is for backups and artifacts, not a substitute for an image registry.

See [Deploy an app](/docs/guides/deploy/) and [Environment variables](/docs/reference/environment/).
