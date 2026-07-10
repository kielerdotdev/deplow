# Data plane — linking & tenancy

How Postgres / Redis / S3 attach to projects. **Implement v1 simply; shape APIs and schema so previews and multi-node don’t force a rewrite.** Sequencing: [sequencing.md](./sequencing.md).

## v1 reality

- **One node** (local Docker).
- **One** Postgres, **one** Redis, **one** MinIO on that node.
- Many projects share those instances (DB/user, ACL/prefix, bucket per project).
- App containers get injected `DATABASE_URL` / `REDIS_URL` / `S3_*` from encrypted project credentials.

## Future we design for (do not build yet)

| Later | Implication for linking |
| --- | --- |
| **Previews (v2)** | Ephemeral app needs its **own** DB/redis/bucket slot (or an explicit “share prod” opt-in). Same node as the parent project. |
| **Multi-node (v3)** | Project pinned to a node; that node’s data plane is the only one the project talks to. Never split app and DB across nodes. |

## Design constraints (v1 code must respect)

### 1. Pin projects to a node early

Even with a single local node, treat placement as data:

- `projects.nodeId` (or equivalent) → the node that owns app **and** data plane for that project
- Provisioners take **node data-plane connection info**, not only process-global `DEPLOW_POSTGRES_*` forever without an indirection

v1: one row in `nodes`, every project points at it. v3: create project → choose/default node → provision on **that** node’s Postgres/Redis/MinIO.

### 2. Provision “slots,” not only “projects”

Today: `createDatabase(slug)` for a project. Tomorrow: production + preview need distinct resources.

Prefer identities like:

```text
slot = { projectId, kind: "production" | "preview", previewKey?: "pr-42" }
resource names derived from slot (stable, unique, destroyable)
```

v1 only creates `kind: "production"`. APIs should not assume “one credential blob per project forever” if that blob can’t grow a preview map or a `slots[]` later.

Credentials stay encrypted; injection at deploy time selects the **slot** for that deployment (production webhook deploy → production slot).

### 3. URLs are node-local

`DATABASE_URL` hostnames must be reachable **from the app container on that node** (Docker network DNS like `postgres`, or the node’s internal address). Do not bake “laptop localhost” into injected URLs for running apps.

Keep a clear split if needed:

- **runtime** URLs (what containers see)
- **operator** URLs (what a human on VPN uses) — optional later; don’t conflate them in one string without a label

### 4. Proxy hostnames reserve preview space

Production: `{slug}.{baseDomain}`  
Preview (v2): `{previewPrefix}-{slug}.{baseDomain}` (e.g. `pr-42-myapp.…`)

Don’t assign production slugs that collide with the preview prefix scheme. Webhook production deploys only update the production route.

### 5. Destroy is slot-aware

Destroy project → tear down **all** slots for that project (v1: just production). Preview GC (v2) destroys one slot + proxy route + container without deleting the project.

### 6. Still one shared instance per node

Do **not** spin a Postgres container per project. Previews and extra projects = more databases/users on the **same** node Postgres. Multi-node = another shared Postgres on node B — not per-project instances ([philosophy.md](./philosophy.md)).

## Anti-patterns

- Hardcoding provisioners to a single global singleton with no `nodeId` / config handle
- Using the same database for production and future previews “to save work”
- Putting the app on node A and credentials aimed at node B’s Postgres
- Publicly proxying Postgres/Redis

## v1 checklist for implementers

When touching provisioning, secrets, or deploy env injection:

- [ ] Project is associated with a node (even if only `local`)
- [ ] Production credentials are clearly the production **slot**
- [ ] Resource names can add a preview suffix later without renaming prod
- [ ] Injected URLs work inside the node Docker network
- [ ] Proxy only publishes app HTTP; data plane stays private
