---
title: Secrets & env
description: How credentials are encrypted, exported, and injected into deployments.
---

Project credentials are sensitive. deplow encrypts them at rest and injects them only at deploy time.

## Encryption

| Variable             | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `DEPLOW_SECRETS_KEY` | Primary AES-GCM key for credential blobs  |
| `BETTER_AUTH_SECRET` | Fallback if `DEPLOW_SECRETS_KEY` is unset |

Set a dedicated secrets key in production:

```ini
DEPLOW_SECRETS_KEY=<random-32+-byte-secret>
```

## Downloadable secrets.yaml

Export `secrets.yaml` from the project page for local development or CI. The format mirrors injected deploy env vars so you can run the same app outside deplow with identical config.

## Injected variables

On every deploy, these are set on the container:

| Variable        | Description                                   |
| --------------- | --------------------------------------------- |
| `DATABASE_URL`  | Postgres connection string for the project DB |
| `REDIS_URL`     | Redis connection URL with project isolation   |
| `S3_ENDPOINT`   | MinIO endpoint URL                            |
| `S3_BUCKET`     | Project bucket name                           |
| `S3_ACCESS_KEY` | Bucket access key                             |
| `S3_SECRET_KEY` | Bucket secret key                             |

## Best practices

- Do not commit `secrets.yaml` to version control
- Rotate platform MinIO keys if a project is compromised
- Destroy projects you no longer need — teardown removes isolated resources
