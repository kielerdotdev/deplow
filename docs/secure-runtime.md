# Secure runtime — gVisor on k3s

You are implementing Hostrig’s **default secure runtime**. Follow this document exactly.

- Stance / priorities: [`security.md`](./security.md)
- Product scope: [`product.md`](./product.md) and [`sequencing.md`](./sequencing.md)
- This doc covers **how user apps run** on Kubernetes.

## Decision (non-negotiable)

| Workload                                              | Runtime                                      | Why                                              |
| ----------------------------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| **User apps** (web / worker Deployments)              | **gVisor RuntimeClass `gvisor` (handler `runsc`)** | Userspace syscall sandbox; CRI/k3s standard   |
| **Platform / data** (Postgres, Redis, Traefik, …)     | **default (runc / containerd)**              | I/O + compatibility; trusted                     |
| **Builds** (Railpack / Docker / BuildKit on CP)       | **runc**                                     | Compilers break or crawl under gVisor            |
| Kata / Firecracker / MicroVMs as default              | **Out of scope (v1)**                        | Optional later via another RuntimeClass          |

**Priority order:** security > easy install > decent performance.

**MicroVMs are unsupported** for v1 (and not a GTM path). Keep isolation behind `runtimeClassName` so a future class could be added without rewriting deploy — do not implement Kata “just in case.”

---

## Target architecture

```
k3s node
├── containerd
│   ├── default runtime (runc): postgres, redis, Traefik, system pods
│   └── runsc handler: user app pods with runtimeClassName=gvisor
│
├── RuntimeClass gvisor → handler runsc
│
└── proj-{slug} namespace
    ├── NetworkPolicy (default-deny + same-ns + kube-system Traefik/DNS)
    ├── LimitRange
    ├── PSS labels (enforce baseline; warn/audit restricted)
    └── web/worker Deployments
        ├── runtimeClassName: gvisor
        ├── securityContext: non-root, RuntimeDefault seccomp
        ├── container: drop ALL caps, no priv-esc, RO rootfs, /tmp emptyDir
        └── resources from DEPLOW_APP_MEMORY_MB / DEPLOW_APP_CPUS
```

Control plane runs **outside** the cluster and never mounts credentials into user app pods beyond injected env/bindings.

---

## Explicitly IN scope

1. Config: `DEPLOW_APP_RUNTIME` (default `runsc` → RuntimeClass `gvisor`)
2. `deployWebService` sets `runtimeClassName`, securityContext, resources, volumes
3. RuntimeClass preflight: create/ensure `gvisor`; fail clearly when required and missing
4. NetworkPolicy + LimitRange + PSS labels on project namespaces
5. Node bootstrap: Hetzner cloud-init installs runsc + containerd config; `scripts/install-gvisor-k3s.sh` for BYO
6. Docs + env examples aligned with k3s (not Docker-as-runtime)

## Explicitly OUT of scope

- Kata, Firecracker, Sysbox, LXD as default
- Sandboxing Postgres/Redis under gVisor
- Running builds under gVisor
- Replacing k3s with a MicroVM orchestrator
- Enforcing PSS `restricted` at namespace level (breaks official Postgres/Redis images) — app pods are still hardened individually

---

## Code touchpoints

| File | Role |
| --- | --- |
| `apps/web/src/lib/k8s/user-app-pod.ts` | `buildUserAppPodHardening` / RuntimeClass name mapping |
| `apps/web/src/lib/k8s/runtime-class.ts` | Ensure RuntimeClass + preflight errors |
| `apps/web/src/lib/k8s/network-policy.ts` | Project isolation NetworkPolicy |
| `apps/web/src/lib/k8s/namespace.ts` | Namespace labels, LimitRange, policy apply |
| `apps/web/src/lib/k8s/deploy.ts` | Wire hardening into Deployments |
| `apps/web/src/lib/core/spawners/k3s-userdata.ts` | Cloud-init installs gVisor before k3s |
| `scripts/install-gvisor-k3s.sh` | BYO / existing node install |

---

## Config

| Env | Default | Meaning |
| --- | --- | --- |
| `DEPLOW_APP_RUNTIME` | `runsc` | Maps to RuntimeClass `gvisor`; `runc` omits RuntimeClass (escape hatch) |
| `DEPLOW_APP_RUNTIME_REQUIRED` | `true` | Fail deploy if RuntimeClass cannot be ensured |
| `DEPLOW_APP_MEMORY_MB` | `512` | Memory request/limit for user apps |
| `DEPLOW_APP_CPUS` | `1` | CPU request/limit for user apps |
| `DEPLOW_APP_READONLY_ROOTFS` | `true` | `readOnlyRootFilesystem` on app containers |

When `DEPLOW_APP_RUNTIME=runc`, log a clear warning — apps are not sandboxed.

---

## Node install (gVisor + k3s)

### Managed Hetzner (cloud-init)

Server and agent userdata (`buildK3sServerUserData` / `buildK3sAgentUserData`) install `runsc` + `containerd-shim-runsc-v1`, write k3s `config.toml.tmpl` with the `runsc` runtime, then install/join k3s. The server also applies RuntimeClass `gvisor`.

### BYO kubeconfig

On **every** node:

```bash
sudo bash scripts/install-gvisor-k3s.sh
kubectl get runtimeclass gvisor
```

Verify a test pod (optional):

```bash
kubectl run gvisor-test --image=alpine --restart=Never \
  --overrides='{"spec":{"runtimeClassName":"gvisor"}}' -- sleep 3
kubectl get pod gvisor-test -o jsonpath='{.spec.runtimeClassName}{"\n"}'
```

---

## Pod hardening (user apps)

Approximate Deployment template for web/worker:

```yaml
spec:
  template:
    spec:
      runtimeClassName: gvisor   # omitted when DEPLOW_APP_RUNTIME=runc
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        fsGroup: 65532
        seccompProfile: { type: RuntimeDefault }
      volumes:
        - name: tmp
          emptyDir: {}
      containers:
        - name: app
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ["ALL"] }
            seccompProfile: { type: RuntimeDefault }
          resources:
            requests: { memory: 512Mi, cpu: "1" }
            limits: { memory: 512Mi, cpu: "1" }
          volumeMounts:
            - name: tmp
              mountPath: /tmp
```

Images that cannot run as non-root or need a writable rootfs: prefer fixing the image; temporary escape hatches are `DEPLOW_APP_READONLY_ROOTFS=false` and `DEPLOW_APP_RUNTIME=runc` (unsandboxed).

---

## NetworkPolicy

Per `proj-*` namespace (`hostrig-project-isolation`):

- Ingress: same namespace + `kube-system` (Traefik)
- Egress: same namespace + DNS (kube-system :53) + TCP 80/443
- Cross-project namespaces: denied by default

---

## MicroVMs — out of product scope

Isolation stays behind `runtimeClassName` (`gvisor` | omitted for `runc`). Nested virt / Kata / Firecracker are **not** product paths. Revisit only under a deliberate compliance requirement — never as install prerequisite or marketing claim.

---

## Not in product

Docker-agent remotes and the hetzner-k3s CLI path are **removed**. Builds may still use Docker/BuildKit on the control plane. **Product runtime is k3s + gVisor RuntimeClass.**

---

## Acceptance criteria

- [ ] User app pods get `runtimeClassName: gvisor` when `DEPLOW_APP_RUNTIME=runsc`
- [ ] Missing RuntimeClass → clear deploy error when required
- [ ] Pod/container securityContext + resource limits applied
- [ ] Project namespaces get NetworkPolicy + LimitRange + PSS labels
- [ ] Hetzner cloud-init installs runsc; BYO script documented
- [ ] Postgres/Redis stay on default runtime
- [ ] No Kata/Firecracker dependency in default install
