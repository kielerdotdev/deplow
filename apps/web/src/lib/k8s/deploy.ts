import type { V1Deployment, V1Ingress, V1Service } from "@kubernetes/client-node"

import { env } from "@/lib/env"

import { apiClients, k8sName, loadKubeConfig, projectNamespace } from "./client"
import { ensureProjectNamespace } from "./namespace"
import { ensureAppRuntimeClass } from "./runtime-class"
import { buildUserAppPodHardening } from "./user-app-pod"

export type K8sWebDeployInput = {
  kubeconfigYaml: string
  projectSlug: string
  serviceId: string
  serviceName: string
  image: string
  containerPort: number
  env: Record<string, string>
  hostname: string | null
  replicas?: number
  labels?: Record<string, string>
  /** Secret name(s) for private registry pulls (e.g. hostrig-registry). */
  imagePullSecrets?: string[]
}

export type K8sWebDeployResult = {
  namespace: string
  deploymentName: string
  publicHost: string | null
}

export async function deployWebService(
  input: K8sWebDeployInput,
): Promise<K8sWebDeployResult> {
  const kc = loadKubeConfig(input.kubeconfigYaml)
  const { core, apps, networking, node } = apiClients(kc)
  const ns = projectNamespace(input.projectSlug)
  const name = k8sName([input.serviceName])
  const labels = {
    "app.kubernetes.io/name": name,
    "app.kubernetes.io/instance": input.serviceId.slice(0, 63),
    "app.kubernetes.io/managed-by": "hostrig",
    "hostrig.io/service-id": input.serviceId.slice(0, 63),
    ...input.labels,
  }

  await ensureProjectNamespace(core, networking, ns)

  const appRuntime = env.appRuntime
  if (appRuntime === "runc" || appRuntime === "default") {
    console.warn(
      "[hostrig] DEPLOW_APP_RUNTIME=runc — user app pods are NOT sandboxed with gVisor",
    )
  }

  const runtimeClassName = await ensureAppRuntimeClass({
    node,
    appRuntime,
    required: env.appRuntimeRequired,
  })

  const hardening = buildUserAppPodHardening({
    appRuntime,
    memoryBytes: env.appMemoryBytes,
    nanoCpus: env.appNanoCpus,
    readOnlyRootfs: env.appReadOnlyRootfs,
  })

  const envList = Object.entries(input.env).map(([envName, value]) => ({
    name: envName,
    value,
  }))

  const deployment: V1Deployment = {
    metadata: { name, namespace: ns, labels },
    spec: {
      replicas: input.replicas ?? 1,
      selector: { matchLabels: { "app.kubernetes.io/name": name } },
      template: {
        metadata: { labels },
        spec: {
          runtimeClassName: runtimeClassName ?? undefined,
          securityContext: hardening.podSecurityContext,
          imagePullSecrets: input.imagePullSecrets?.length
            ? input.imagePullSecrets.map((n) => ({ name: n }))
            : undefined,
          volumes: hardening.volumes,
          containers: [
            {
              name,
              image: input.image,
              ports: [{ containerPort: input.containerPort }],
              env: envList,
              imagePullPolicy: "Always",
              securityContext: hardening.containerSecurityContext,
              resources: hardening.resources,
              volumeMounts: hardening.volumeMounts,
            },
          ],
        },
      },
    },
  }

  try {
    await apps.readNamespacedDeployment({ name, namespace: ns })
    await apps.replaceNamespacedDeployment({
      name,
      namespace: ns,
      body: deployment,
    })
  } catch {
    await apps.createNamespacedDeployment({ namespace: ns, body: deployment })
  }

  const service: V1Service = {
    metadata: { name, namespace: ns, labels },
    spec: {
      selector: { "app.kubernetes.io/name": name },
      ports: [
        {
          port: 80,
          targetPort: input.containerPort,
          name: "http",
        },
      ],
    },
  }

  try {
    await core.readNamespacedService({ name, namespace: ns })
    await core.replaceNamespacedService({ name, namespace: ns, body: service })
  } catch {
    await core.createNamespacedService({ namespace: ns, body: service })
  }

  let publicHost: string | null = null
  if (input.hostname) {
    publicHost = input.hostname
    const ingress: V1Ingress = {
      metadata: {
        name,
        namespace: ns,
        labels,
        annotations: {
          "traefik.ingress.kubernetes.io/router.entrypoints": "web",
        },
      },
      spec: {
        ingressClassName: "traefik",
        rules: [
          {
            host: input.hostname,
            http: {
              paths: [
                {
                  path: "/",
                  pathType: "Prefix",
                  backend: {
                    service: {
                      name,
                      port: { number: 80 },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    }
    try {
      await networking.readNamespacedIngress({ name, namespace: ns })
      await networking.replaceNamespacedIngress({
        name,
        namespace: ns,
        body: ingress,
      })
    } catch {
      await networking.createNamespacedIngress({ namespace: ns, body: ingress })
    }
  }

  return { namespace: ns, deploymentName: name, publicHost }
}

export async function deleteWebService(input: {
  kubeconfigYaml: string
  projectSlug: string
  serviceName: string
}): Promise<void> {
  const kc = loadKubeConfig(input.kubeconfigYaml)
  const { core, apps, networking } = apiClients(kc)
  const ns = projectNamespace(input.projectSlug)
  const name = k8sName([input.serviceName])
  const ignore = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch {
      // already gone
    }
  }
  await ignore(() =>
    networking.deleteNamespacedIngress({ name, namespace: ns }),
  )
  await ignore(() => core.deleteNamespacedService({ name, namespace: ns }))
  await ignore(() => apps.deleteNamespacedDeployment({ name, namespace: ns }))
}

export async function scaleWebService(input: {
  kubeconfigYaml: string
  projectSlug: string
  serviceName: string
  replicas: number
}): Promise<void> {
  const kc = loadKubeConfig(input.kubeconfigYaml)
  const { apps } = apiClients(kc)
  const ns = projectNamespace(input.projectSlug)
  const name = k8sName([input.serviceName])
  const current = await apps.readNamespacedDeployment({ name, namespace: ns })
  if (!current.spec) throw new Error("Deployment has no spec")
  current.spec.replicas = input.replicas
  await apps.replaceNamespacedDeployment({
    name,
    namespace: ns,
    body: current,
  })
}

function containerWaitingSummary(pod: {
  status?: {
    phase?: string
    containerStatuses?: Array<{
      name?: string
      ready?: boolean
      state?: {
        waiting?: { reason?: string; message?: string }
        running?: { startedAt?: string | Date }
        terminated?: { reason?: string; message?: string }
      }
    }>
    conditions?: Array<{ type?: string; status?: string; message?: string }>
  }
}): string {
  const phase = pod.status?.phase ?? "Unknown"
  const lines = [`Pod phase: ${phase}`]
  for (const c of pod.status?.containerStatuses ?? []) {
    const waiting = c.state?.waiting
    const terminated = c.state?.terminated
    if (waiting) {
      lines.push(
        `Container ${c.name}: waiting (${waiting.reason ?? "unknown"})${
          waiting.message ? ` — ${waiting.message}` : ""
        }`,
      )
    } else if (terminated) {
      lines.push(
        `Container ${c.name}: terminated (${terminated.reason ?? "unknown"})${
          terminated.message ? ` — ${terminated.message}` : ""
        }`,
      )
    } else if (c.state?.running) {
      lines.push(`Container ${c.name}: running`)
    }
  }
  return lines.join("\n")
}

export async function getPodLogs(input: {
  kubeconfigYaml: string
  projectSlug: string
  serviceName: string
  tailLines?: number
}): Promise<string> {
  // Never throw — UI must show diagnostics even when the container is not running.
  try {
    const kc = loadKubeConfig(input.kubeconfigYaml)
    const { core } = apiClients(kc)
    const ns = projectNamespace(input.projectSlug)
    const name = k8sName([input.serviceName])
    const pods = await core.listNamespacedPod({
      namespace: ns,
      labelSelector: `app.kubernetes.io/name=${name}`,
    })
    const pod = pods.items?.[0]
    if (!pod?.metadata?.name) {
      return `No pods in namespace ${ns} for ${name}.\nDeployment may still be creating.`
    }

    const podName = pod.metadata.name
    const running = Boolean(
      pod.status?.containerStatuses?.some((c) => c.state?.running),
    )
    const waiting = pod.status?.containerStatuses?.find((c) => c.state?.waiting)
      ?.state?.waiting

    if (!running || waiting) {
      const events = await recentPodEvents(core, ns, podName)
      const fatal = events.find((e) => isFatalSandboxOrNetworkEvent(e))
      const hint = fatal
        ? `\n\nCluster network error (CNI/Cilium) — fix the node network stack, then redeploy.\n${fatal}`
        : "\n\nLogs appear once the container is running."
      return `${containerWaitingSummary(pod)}\n\nEvents:\n${
        events.length ? events.join("\n") : "(none)"
      }${hint}`
    }

    try {
      const log = await core.readNamespacedPodLog({
        name: podName,
        namespace: ns,
        container: name,
        tailLines: input.tailLines ?? 200,
      })
      const text = typeof log === "string" ? log : String(log)
      return text.trim() ? text : "(container running — no log lines yet)"
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // Common: still starting; never surface as a hard UI failure.
      if (/waiting to start|ContainerCreating|BadRequest/i.test(message)) {
        const events = await recentPodEvents(core, ns, podName)
        return `${containerWaitingSummary(pod)}\n\nEvents:\n${events.join("\n") || "(none)"}\n\nContainer not ready for logs yet.`
      }
      return `${containerWaitingSummary(pod)}\n\nCould not read logs: ${message}`
    }
  } catch (e) {
    return `Failed to inspect pods: ${e instanceof Error ? e.message : String(e)}`
  }
}

async function recentPodEvents(
  core: ReturnType<typeof apiClients>["core"],
  namespace: string,
  podName: string,
): Promise<string[]> {
  try {
    const ev = await core.listNamespacedEvent({
      namespace,
      fieldSelector: `involvedObject.name=${podName}`,
    })
    return (ev.items ?? [])
      .slice(-12)
      .map(
        (e) =>
          `${e.reason ?? "?"}: ${e.message ?? ""}`.replace(/\s+/g, " ").trim(),
      )
      .filter(Boolean)
  } catch {
    return []
  }
}

function isFatalSandboxOrNetworkEvent(message: string): boolean {
  return /FailedCreatePodSandBox|failed to setup network|Cilium API client timeout|cni.*failed|network is not ready|runtime handler.*not found|runsc|Unknown runtime/i.test(
    message,
  )
}

/** Wait until at least one pod is Running (or timeout / fatal CNI error). */
export async function waitForDeploymentReady(input: {
  kubeconfigYaml: string
  projectSlug: string
  serviceName: string
  timeoutMs?: number
}): Promise<{ ready: boolean; message: string }> {
  const timeoutMs = input.timeoutMs ?? 90_000
  const deadline = Date.now() + timeoutMs
  const kc = loadKubeConfig(input.kubeconfigYaml)
  const { core } = apiClients(kc)
  const ns = projectNamespace(input.projectSlug)
  const name = k8sName([input.serviceName])
  let last = "waiting for pods"

  while (Date.now() < deadline) {
    const pods = await core.listNamespacedPod({
      namespace: ns,
      labelSelector: `app.kubernetes.io/name=${name}`,
    })
    const pod = pods.items?.[0]
    if (pod?.metadata?.name) {
      last = containerWaitingSummary(pod)
      const events = await recentPodEvents(core, ns, pod.metadata.name)
      const fatal = events.find((e) => isFatalSandboxOrNetworkEvent(e))
      if (fatal) {
        return {
          ready: false,
          message: `${last}\n\nCluster sandbox/network error:\n${fatal}\n\nOther events:\n${events.slice(-5).join("\n")}\n\nIf this mentions runsc/gVisor, install gVisor on nodes (docs/secure-runtime.md). Otherwise fix CNI, then redeploy.`,
        }
      }

      const running = pod.status?.containerStatuses?.some((c) => c.state?.running)
      const waitingReason = pod.status?.containerStatuses?.find(
        (c) => c.state?.waiting,
      )?.state?.waiting?.reason
      if (running) return { ready: true, message: last }
      if (
        waitingReason === "ImagePullBackOff" ||
        waitingReason === "ErrImagePull" ||
        waitingReason === "CrashLoopBackOff" ||
        waitingReason === "CreateContainerConfigError"
      ) {
        return {
          ready: false,
          message: `${last}\n\n${events.slice(-5).join("\n")}`,
        }
      }
      if (events.length) {
        last = `${last}\n\nEvents:\n${events.slice(-5).join("\n")}`
      }
    }
    await new Promise((r) => setTimeout(r, 2_000))
  }
  return { ready: false, message: `Timed out after ${timeoutMs}ms.\n${last}` }
}
