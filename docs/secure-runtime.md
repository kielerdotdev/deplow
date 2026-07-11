# Secure runtime — gVisor + hardened Docker

You are implementing deplow’s **default secure runtime**. Follow this document exactly.

- Stance / priorities: [`security.md`](./security.md)
- Product scope: [`product.md`](./product.md) and [`goal.md`](./goal.md)
- This doc only covers **how user apps run**.

## Decision (non-negotiable)

| Workload                                              | Runtime                                   | Why                                              |
| ----------------------------------------------------- | ----------------------------------------- | ------------------------------------------------ |
| **User apps** (Railpack / Dockerfile / image deploys) | **gVisor (`runsc`)**                      | Userspace syscall sandbox; OCI/Docker standard   |
| **Platform** (Postgres, Redis, MinIO, deplow web)     | **runc** (default)                        | I/O + compatibility; trusted                     |
| **Builds** (Railpack / `docker build` / BuildKit)     | **runc**                                  | Compilers + BuildKit break or crawl under gVisor |
| Docker daemon                                         | **Rootful Docker**                        | Easy install; do not require rootless for v1     |
| Host UID mapping                                      | **`userns-remap: default`** (recommended) | Container root ≠ host root                       |
| Kata / Firecracker / Sysbox / rootless-as-default     | **Out of scope**                          | Defer                                            |

**Priority order:** security > easy install > decent performance.  
Do not add microVMs, Podman migration, or rootless Docker as the default path in this work.

---

## Target architecture

```
Host (Docker Engine)
├── dockerd
│   ├── userns-remap: default          (daemon.json; document if skipped)
│   ├── runtimes.runsc → /usr/local/bin/runsc
│   │
│   ├── runc:  postgres, redis, minio, deplow   (compose)
│   ├── runc:  Railpack / BuildKit builds
│   └── runsc: every user app container         (DockerNodeExecutor)
│
└── Socket /var/run/docker.sock
    └── Only deplow control plane may use it
        NEVER mount into user app containers
```

User apps join the platform compose network for DNS (`postgres` / `redis` / `minio`) but must not receive the Docker socket or host network mode.

---

## Explicitly IN scope

1. Config: `DEPLOW_APP_RUNTIME` (default `runsc`)
2. `DockerNodeExecutor` always sets `HostConfig.Runtime` for user deploys
3. Hardened `HostConfig` defaults for user apps (caps, RO rootfs, no-new-privileges, limits)
4. Runtime preflight: fail deploy clearly if `runsc` required but missing
5. Optional `runsc-kvm` when `/dev/kvm` exists (document + config; not required for MVP)
6. Install + docs: Docker + gVisor + compose + userns-remap (README + Starlight prerequisites)
7. Tests for HostConfig shape / runtime selection (unit; no need for live gVisor in CI unless easy)

## Explicitly OUT of scope

- Rootless Docker / Podman as default
- Kata, Firecracker, Sysbox, LXD
- Sandboxing Postgres/Redis/MinIO with gVisor
- Running builds under gVisor
- Host network passthrough / disabling gVisor netstack by default
- Multi-node / Swarm / K8s (proxy is single-host; see [`access.md`](./access.md) for URL routing)

---

## Current code touchpoints

| File                                                               | Change                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `apps/web/src/lib/core/platform-config.ts`                         | Add `appRuntime`, `appMemoryBytes?`, `appNanoCpus?`, maybe `requireAppRuntime` |
| `apps/web/src/lib/core/docker-node-executor.ts`                    | Apply `Runtime` + hardening on `createContainer` for user apps                 |
| `apps/web/src/lib/core/index.ts`                                   | Export any new types if needed                                                 |
| `apps/web/.env.example` / root `.env.example`                      | Document new env vars                                                          |
| `README.md` + `apps/site` docs                                     | Install: Docker, gVisor, userns-remap, compose                                 |
| Optional: `scripts/check-runtime.sh` or oRPC `nodes.status` detail | Report whether `runsc` is installed                                            |

Do **not** put gVisor/`Runtime` on:

- one-shot `exec` helper containers (alpine probes) unless they are user workloads — prefer runc for tiny probes
- platform compose services

---

## Milestone S1 — Config

Add to `PlatformConfig` / `loadPlatformConfig()`:

| Env                           | Default                                     | Meaning                                         |
| ----------------------------- | ------------------------------------------- | ----------------------------------------------- |
| `DEPLOW_APP_RUNTIME`          | `runsc`                                     | OCI runtime name passed to Docker for user apps |
| `DEPLOW_APP_RUNTIME_REQUIRED` | `true` in production-ish; `true` by default | If true, deploy fails when runtime missing      |
| `DEPLOW_APP_MEMORY_MB`        | `512` (or similar sensible default)         | Memory limit for user apps                      |
| `DEPLOW_APP_CPUS`             | `1`                                         | CPU limit (map to `NanoCpus`)                   |

Allow `DEPLOW_APP_RUNTIME=runc` only as escape hatch; when not `runsc`, log a clear warning from the executor or deploy path.

---

## Milestone S2 — Hardened user deploy (`DockerNodeExecutor`)

For **user app** `deployApp` (not ephemeral probe helpers), set `HostConfig` approximately:

```ts
HostConfig: {
  Runtime: config.appRuntime, // "runsc" by default
  NetworkMode: platformNetwork, // existing behavior
  PortBindings: portBindings,
  RestartPolicy: { Name: "unless-stopped" },

  CapDrop: ["ALL"],
  // CapAdd: only if you later need NET_BIND_SERVICE for binding <1024 inside sandbox
  SecurityOpt: ["no-new-privileges:true"],
  ReadonlyRootfs: true,
  Tmpfs: {
    "/tmp": "rw,noexec,nosuid,size=64m",
  },
  Memory: memoryBytes,
  NanoCpus: nanoCpus,

  // NEVER:
  // Privileged: true
  // Binds including docker.sock
  // NetworkMode: "host"
  // PidMode: "host"
}
```

Notes:

- Some images need write access outside `/tmp` (e.g. `/.next`, `/app/data`). Prefer documenting “app must use `/tmp` or a mounted volume” over weakening defaults. If RO rootfs breaks common Railpack images, add an **opt-in** `readOnlyRootfs: false` on deploy options — default stays `true`.
- Keep existing labels (`deplow.managed`, `deplow.projectId`, etc.).
- Builds stay unchanged (runc/BuildKit); only the **final** `deployApp` image runs under `runsc`.

### Runtime preflight

Before create (or on first deploy after process start):

1. `docker.info()` → check `Runtimes` includes `config.appRuntime`
2. If missing and `appRuntimeRequired` → throw actionable error:  
   `gVisor runtime "runsc" is not installed. See README (runsc install).`
3. Optionally cache the check for process lifetime

---

## Milestone S3 — Host install documentation

Update `README.md`, Starlight prerequisites, and `.env.example` with a short **Secure runtime** section (must match [`security.md`](./security.md)):

### 1. Docker Engine

Official Docker Engine (not only Docker Desktop sock hacks in prod).

### 2. gVisor

```bash
# Follow current https://gvisor.dev/docs/user_guide/install/
# Then:
sudo runsc install
sudo systemctl restart docker
docker run --rm --runtime=runsc hello-world
```

Verify `dmesg` inside the test container shows gVisor boot lines (sanity only).

### 3. userns-remap (recommended)

`/etc/docker/daemon.json` (merge with existing `runtimes` from `runsc install`):

```json
{
  "userns-remap": "default",
  "runtimes": {
    "runsc": {
      "path": "/usr/local/bin/runsc"
    }
  }
}
```

Restart Docker. Document that remap can break some volume ownership edge cases; platform compose volumes are fine for v1.

### 4. Platform compose

`docker compose up -d` for Postgres/Redis/MinIO — **default runtime (runc)**.

### 5. Performance note

- Bare metal with `/dev/kvm`: optional second runtime:

```json
"runsc-kvm": {
  "path": "/usr/local/bin/runsc",
  "runtimeArgs": ["--platform=kvm"]
}
```

Set `DEPLOW_APP_RUNTIME=runsc-kvm` when available.

- Inside VMs without nested virt: keep default `runsc` (systrap). Acceptable for typical web apps.
- Do **not** document hostinet/network passthrough as default.

---

## Milestone S4 — Safety checks & UX

1. Deploy / project UI or API error surfaces the “runsc missing” message (not a generic 500).
2. `nodes.status` or health path may report: `appRuntime`, `appRuntimeAvailable: boolean`.
3. Destroy/stop paths unchanged; gVisor containers stop like normal Docker containers.
4. Confirm user containers are **not** created with binds to `/var/run/docker.sock`.

---

## Acceptance criteria

- [x] `DEPLOW_APP_RUNTIME` defaults to `runsc` and is applied on user `deployApp`
- [x] User app containers get CapDrop ALL, no-new-privileges, ReadonlyRootfs (+ tmpfs), memory/CPU limits
- [x] Missing `runsc` → clear deploy error when required
- [x] Platform compose services still use default runc (no compose `runtime: runsc`)
- [x] Build pipeline does not force `runsc`
- [x] README + user docs document Docker + gVisor + userns-remap + env vars
- [x] `docker.sock` is never mounted into user apps
- [x] `pnpm check` / `pnpm test` pass
- [x] No Kata/Firecracker/rootless default work landed

## Manual verify (on a machine with Docker + gVisor)

```bash
# After deploy of a test image via deplow:
docker inspect <container> --format '{{.HostConfig.Runtime}} {{.HostConfig.ReadonlyRootfs}} {{.HostConfig.CapDrop}}'
# Expect: runsc true [ALL] (or equivalent)

docker exec <container> dmesg 2>/dev/null | head
# Expect gVisor banner (if dmesg allowed in sandbox)
```

---

## Implementation order

1. S1 — config fields + env
2. S2 — `DockerNodeExecutor` Runtime + hardening + preflight
3. S4 — status/error surfacing
4. S3 — README / Starlight / `.env.example`
5. Unit tests for HostConfig construction (extract a small `buildUserAppHostConfig(config, opts)` helper if that keeps the executor clean)

## Non-goals / do not bikeshed

- Perfect RO-rootfs compatibility for every image — default secure; opt-out later
- Making gVisor work for Postgres
- Rewriting the executor to containerd/CRI
- Changing product scope in [`product.md`](./product.md) / [`goal.md`](./goal.md) (domains, multi-server, etc.)

When blocked on an image that cannot run under gVisor, document `DEPLOW_APP_RUNTIME=runc` as temporary escape hatch — do not weaken global defaults.
