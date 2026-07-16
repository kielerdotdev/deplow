# Observe

Optional observability module: Sentry-SDK-compatible **errors**, OTLP **traces/metrics/logs**, ClickHouse storage, Deploy | Observe UI modes.

## Enable

```bash
# .env
DEPLOW_OBSERVE_ENABLED=1
DEPLOW_CLICKHOUSE_URL=http://127.0.0.1:8123

pnpm infra:observe   # clickhouse + otelcol
pnpm dev
```

Observe **requires** ClickHouse when enabled (no SQLite event fallback).

## Ingest

| Protocol | Path |
| --- | --- |
| Sentry envelope | `POST /api/{sentryId}/envelope/` |
| Sentry store (legacy) | `POST /api/{sentryId}/store/` |
| OTLP (via gateway → otelcol) | `POST /api/{sentryId}/otlp/v1/{traces\|metrics\|logs}` |

Auth: `X-Sentry-Auth: Sentry sentry_key=...` or `?sentry_key=`.

DSN from Observe → project Setup, or auto-injected on deploy as `SENTRY_DSN` + `OTEL_*`.

## Dogfood (dev, on by default)

With `DEPLOW_OBSERVE_ENABLED=1`, development mode **automatically**:

1. Creates a Deploy project `deplow-dogfood` (after you have an org — sign up once)
2. Enables Observe on it and mints a DSN
3. Initializes browser + Node Sentry SDKs against that DSN

No extra env vars required. Opt out with `DEPLOW_OBSERVE_DOGFOOD=0`.

Optional overrides:

```bash
DEPLOW_OBSERVE_DOGFOOD_DSN=http://…@localhost:3000/1   # skip auto-mint
DEPLOW_OBSERVE_DOGFOOD_PROJECT_ID=<uuid>                 # use an existing project
```

Look for `[observe-dogfood]` in the server/browser console. Open Observe → project **deplow-dogfood** → Issues.

## Architecture

- **SQLite**: observe projects, keys, issues, groupings, rollups
- **ClickHouse**: event/span/metric/log payloads only
- **BullMQ** `deplow-observe-digest`: stage → group → CH insert
- **otelcol**: OTLP → ClickHouse (same tables)

Inspired by BugSink (errors pipeline), SigNoz/ClickStack (OTel→CH), Sentry DSN/OTLP auth — reimplemented; no vendored code.

## UI

Sidebar **Deploy | Observe**. Observe → Home / Issues / Setup.

## Testing

```bash
pnpm test:observe          # unit + structure + CH integration (skips if CH down)
pnpm smoke:observe-ch      # force ClickHouse migrate/insert smoke
pnpm infra:observe
DEPLOW_OBSERVE_ENABLED=1 pnpm dev
pnpm e2e:observe           # signup → ingest → digest → SSR + Playwright UI
```
