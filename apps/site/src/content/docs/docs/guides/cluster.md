---
title: Connect a cluster
description: Attach a k3s cluster (BYO kubeconfig or managed create) so Hostrig can schedule apps.
---

Hostrig deploys onto **Kubernetes (k3s)**. Connect a cluster once under **Settings → Cluster**, then day-to-day work stays project → services → bind → deploy.

## Options

1. **BYO kubeconfig** — paste or upload a kubeconfig that can create namespaces, Deployments, Services, and Ingresses.
2. **Managed create** — if enabled on your instance, create a small k3s node (for example via Hetzner) and register it automatically.

## gVisor

User **apps** (web / worker) run under the gVisor RuntimeClass by default. Install `runsc` on every node (see `scripts/install-gvisor-k3s.sh` in the repo). Postgres and Redis in the project namespace use the default runtime.

## After connect

- Confirm cluster status is **connected** in Settings → Cluster
- Set your platform base domain under Networking
- Create a project and add services

See also [Prerequisites](/docs/getting-started/prerequisites/) and [Architecture](/docs/concepts/architecture/).
