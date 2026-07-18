# Data plane — services & bindings

How Postgres / Redis / S3 attach. **Implement simply; shape APIs so previews don’t force a rewrite.**

## Reality

- **One k3s cluster** in v1 (grow with workers; no autoscaling).
- **Postgres + Redis are typed services** (`services.type = postgres|redis`), provisioned on demand as Kubernetes workloads in the project namespace.
- **Explicit bindings** inject credentials into app pods (`service_bindings`).
- **One shared MinIO** — per-project bucket + keys, provisioned lazily for backups.
- Durable work runs on **BullMQ** (platform Redis), with SQLite `operations` as source of truth.

## Design constraints

### 1. Workloads live in the project namespace

Apps and data services for a project schedule in `proj-{slug}`. Capacity is cluster-wide (add k3s workers), not a per-project Docker host.

### 2. Service identity is the slot

```text
serviceId = durable identity for provision / backup / PITR stanza
```

Multiple Postgres/Redis services per project are allowed (unique by name).

### 3. URLs are cluster-local

`DATABASE_URL` / `REDIS_URL` hostnames must be reachable from app pods (Kubernetes DNS in the project namespace).

### 4. Destroy is service-aware

Destroy project → tear down all child services + volumes + S3 bucket.

### 5. Backups & PITR are per data service

- Snapshots go through capability interfaces on each postgres/redis service.
- PITR stanza prefers `serviceId` (legacy: project id when a single migrated postgres exists).

## Capability drivers

| Kind     | Source              | Backup               | PITR                           |
| -------- | ------------------- | -------------------- | ------------------------------ |
| postgres | k8s StatefulSet     | pg_dump              | pgBackRest stanza = project id (prefer service id later) |
| redis    | k8s Deployment      | full-instance export | —                              |
| s3       | shared-instance     | —                    | —                              |

## Anti-patterns

- Auto-injecting every secret into every service
- Sharing one Postgres across projects as the default
- Publishing Postgres/Redis through Traefik
- Pinning apps to a Docker-agent node identity
