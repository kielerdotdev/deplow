---
title: Backups
description: Snapshots for project Postgres and Redis to platform S3; optional PITR.
---

Hostrig backs up **data services** (Postgres and Redis). Open a Postgres/Redis service and use its **Backups** UI — there is no separate project-level “Database product” outside the service.

## Snapshots

On-demand or scheduled backups call each backup-capable resource:

| Kind | Snapshot |
| --- | --- |
| **Postgres** | `pg_dump` custom format → platform backup bucket |
| **Redis** | Full-instance export → platform backup bucket |

Retention: `HOSTRIG_BACKUP_RETAIN` (default 7) per resource.

Platform object storage is MinIO (bundled by default) or external S3/R2 (`HOSTRIG_S3_*`). Bucket name defaults via `HOSTRIG_BACKUP_BUCKET` (`hostrig-backups`).

## Point-in-time recovery (PITR)

PITR is **optional** and gated:

```bash
HOSTRIG_PITR_ENABLED=1
PGBACKREST_CONFIG=/absolute/path/to/infra/pgbackrest/pgbackrest.conf
```

It applies to **Postgres** only (not Redis). Setup involves a pgBackRest stanza and operator configuration — see repo `infra/pgbackrest/` and `docs/data-plane.md`. If PITR is not enabled, the UI will not offer a recoverable window.

Redis does not support PITR in v1 (use snapshots).

## What backups are not

- Not a substitute for offsite disaster recovery you never test
- Not continuous multi-region replication as a product feature
- Not public Postgres/Redis endpoints for external dump tools (data plane stays private)
