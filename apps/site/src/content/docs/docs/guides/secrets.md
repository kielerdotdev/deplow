---
title: Bindings & secrets
description: How credentials are encrypted, bound, and injected into deployments.
---

Project credentials are sensitive. Hostrig encrypts them at rest and injects them at deploy time **only through explicit service bindings** (plus lazy project S3 when provisioned).

## Encryption

| Variable | Purpose |
| --- | --- |
| `DEPLOW_SECRETS_KEY` | Primary AES-GCM key for credential blobs |
| `BETTER_AUTH_SECRET` | Fallback if `DEPLOW_SECRETS_KEY` is unset |

Set a dedicated secrets key in production:

```ini
DEPLOW_SECRETS_KEY=<random-32+-byte-secret>
```

## Bindings (least privilege)

Apps do **not** automatically receive every project credential. Create a binding from a consumer (web/worker) to a provider (postgres/redis) so the platform injects the right env key — typically `DATABASE_URL` or `REDIS_URL`.

S3 credentials (`S3_*`) are injected when the project’s platform bucket has been provisioned (lazy, often for backups).

## Downloadable secrets.yaml

Export `secrets.yaml` from the project for local development or CI. The format mirrors bound deploy env vars so you can run the same app outside Hostrig with identical config.

## Common injected variables

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (via binding) |
| `REDIS_URL` | Redis connection URL (via binding) |
| `S3_ENDPOINT` | Platform S3 endpoint |
| `S3_BUCKET` | Project bucket name |
| `S3_ACCESS_KEY` | Bucket access key |
| `S3_SECRET_KEY` | Bucket secret key |
| `S3_REGION` | Region (when applicable) |

## Best practices

- Do not commit `secrets.yaml` to version control
- Bind only the keys each service needs
- Destroy projects you no longer need — teardown removes isolated resources
- Treat MCP tokens like passwords (Settings → API & MCP access)
