# Data plane — services & bindings

How Postgres / Redis / S3 attach. **Implement simply; shape APIs so previews and multi-node don’t force a rewrite.**

## Reality

- **One node** (local Docker) in v1.
- **Postgres + Redis are typed services** (`services.type = postgres|redis`), provisioned on demand (not at project create).
- **Explicit bindings** inject credentials into app containers (`service_bindings`).
- **One shared MinIO** — per-project bucket + keys, provisioned lazily for backups.
- Durable work runs on **BullMQ** (platform Redis), with SQLite `operations` as source of truth.

## Design constraints

### 1. Pin projects to a node early

`projects.nodeId` → the node that owns app **and** data containers for that project.

### 2. Service identity is the slot

```text
serviceId = durable identity for provision / backup / PITR stanza
```

Multiple Postgres/Redis services per project are allowed (unique by name).

### 3. URLs are node-local

`DATABASE_URL` / `REDIS_URL` hostnames must be reachable from app containers (Docker DNS).

### 4. Destroy is service-aware

Destroy project → tear down all child services + volumes + S3 bucket.

### 5. Backups & PITR are per data service

- Snapshots go through capability interfaces on each postgres/redis service.
- PITR stanza prefers `serviceId` (legacy: project id when a single migrated postgres exists).


## Capability drivers

| Kind     | Source              | Backup               | PITR                           |
| -------- | ------------------- | -------------------- | ------------------------------ |
| postgres | dedicated-container | pg_dump              | pgBackRest stanza = project id (prefer service id later) |
| redis    | dedicated-container | full-instance export | —                              |
| s3       | shared-instance     | —                    | —                              |

## Anti-patterns

- Hardcoding provisioners to a single global shared Postgres/Redis with no per-project lifecycle
- Publicly proxying Postgres/Redis
- Putting the app on node A and credentials aimed at node B’s data containers
