---
title: Backups
description: Snapshots and PITR for project data services
---

Hostrig backs up **data services** (Postgres and Redis). Open a Postgres/Redis service and use its **Database** / **Backups** tabs — there is no project-level Database or Backups section.

Drivers expose a shared `BackupCapable` interface so the same UI works for each kind.

## Snapshots

On-demand or scheduled backups call each backup-capable resource:

- **Postgres** — `pg_dump -Fc` of the dedicated project instance → MinIO
- **Redis** — full-instance key export → MinIO

Retention: `DEPLOW_BACKUP_RETAIN` (default 7) per resource link.

## Point-in-time recovery (PITR)

PITR applies to the project’s **dedicated Postgres container** only (stanza = project id).

```bash
DEPLOW_PITR_ENABLED=1
PGBACKREST_CONFIG=/absolute/path/to/infra/pgbackrest/pgbackrest.conf
```

1. Copy `infra/pgbackrest/pgbackrest.conf.example` → `pgbackrest.conf` (or edit the checked-in local conf).
2. Add a `[<project-id>]` stanza (user `p_<slug>`, database `d_<slug>`).
3. Create the stanza against the data volume:

```bash
./infra/pgbackrest/ensure-stanza.sh <project-id> <project-slug>
```

Restore stops that container, restores its data volume to the target time, and starts it again — the whole instance for that project, not a single DB carved out of a shared cluster.

Redis does not support PITR in v1 (use snapshots / export-import).

The service **Backups** tab shows the recoverable window when PITR is enabled and offers **Restore to point in time**.
