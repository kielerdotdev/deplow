---
title: Observe
description: Optional Sentry-compatible errors and OTLP telemetry on the same control plane.
---

**Observe is optional.** Deploy works without it. Enable Observe when you want errors, traces, logs, metrics, and issues next to your projects.

## Enable

1. Run the Observe infra profile (ClickHouse + otel collector) — see [Scripts](/docs/reference/scripts/)
2. Set `DEPLOW_OBSERVE_ENABLED=true` (and related env) on the control plane — see [Environment](/docs/reference/environment/)
3. Open **Observe** in the app and pick a project

## What you get

- Sentry-compatible error grouping / issues
- OTLP traces, metrics, and logs
- Project-scoped explorer and time ranges

## What you do not get (v1)

- A separate SaaS bill for observability
- A requirement to enable Observe before first deploy

Deploys may inject Sentry/OTLP-related env when Observe is enabled for a project. See [Projects & services](/docs/concepts/projects/).
