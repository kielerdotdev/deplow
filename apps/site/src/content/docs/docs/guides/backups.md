---
title: Backups
description: On-demand and scheduled Postgres backups to the platform S3 bucket.
---

deplow backs up **Postgres only** — per-project database dumps stored in the platform backup bucket.

## On-demand backup

Trigger a backup from the project page or via the oRPC `backups` API. deplow:

1. Runs `pg_dump` against the project's database
2. Uploads the artifact to MinIO (`DEPLOW_BACKUP_BUCKET`, default `deplow-backups`)
3. Records status on the `backups` table

## Scheduled backups

Every project gets a schedule on create (default: daily). The scheduler runs in the web process using a simple interval — no separate worker required for v1.

Configure the default interval globally:

```ini
DEPLOW_BACKUP_DEFAULT_INTERVAL_MS=86400000
```

For demos, a shorter interval works:

```ini
DEPLOW_BACKUP_DEFAULT_INTERVAL_MS=10000
```

## Failure handling

If a scheduled backup fails, the backup row is marked `failed` with an `errorMessage`. There is no notification system in v1 — check the project page or database for status.

## Restore

deplow does not yet provide one-click restore. Download the dump from MinIO and restore manually:

```bash
psql "$DATABASE_URL" < backup.sql
```

Use the project's `DATABASE_URL` from secrets or the dashboard.
