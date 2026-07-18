/**
 * Keep Traefik off the public internet.
 *
 * k3s defaults Traefik to Service type LoadBalancer, which allocates NodePorts
 * on every node. On cloud VMs those NodePorts are often reachable on the public
 * IP, bypassing Cloudflare/NetBird/Tailscale edges.
 *
 * Product model (docs/access.md): edges forward to Traefik on loopback
 * (http://127.0.0.1:80). Prefer ClusterIP + optional host-network origin proxy.
 */

import type { apiClients } from "./client"
import { loadKubeConfig } from "./client"

type CoreApi = ReturnType<typeof apiClients>["core"]

export type TraefikHardenResult = {
  patched: boolean
  serviceName: string | null
  previousType: string | null
  message: string
}

async function findTraefikService(core: CoreApi) {
  try {
    const list = await core.listNamespacedService({ namespace: "kube-system" })
    const hit = (list.items ?? []).find((s) =>
      (s.metadata?.name ?? "").toLowerCase().includes("traefik"),
    )
    if (hit) return hit
  } catch {
    // fall through
  }
  const all = await core.listServiceForAllNamespaces()
  return (
    (all.items ?? []).find((s) =>
      (s.metadata?.name ?? "").toLowerCase().includes("traefik"),
    ) ?? null
  )
}

/**
 * Patch Traefik Service → ClusterIP and clear node ports so apps are not
 * reachable as raw NodePort on public node IPs.
 */
export async function ensureTraefikNotPublic(
  kubeconfigYaml: string,
): Promise<TraefikHardenResult> {
  const { core } = (
    await import("./client")
  ).apiClients(loadKubeConfig(kubeconfigYaml))

  const svc = await findTraefikService(core)
  if (!svc?.metadata?.name || !svc.metadata.namespace) {
    return {
      patched: false,
      serviceName: null,
      previousType: null,
      message: "Traefik Service not found",
    }
  }

  const name = svc.metadata.name
  const ns = svc.metadata.namespace
  const previousType = svc.spec?.type ?? null

  if (previousType === "ClusterIP") {
    const hasNodePort = (svc.spec?.ports ?? []).some(
      (p) => typeof p.nodePort === "number" && p.nodePort > 0,
    )
    if (!hasNodePort) {
      return {
        patched: false,
        serviceName: name,
        previousType,
        message: "Traefik already ClusterIP without NodePorts",
      }
    }
  }

  const ports = (svc.spec?.ports ?? []).map((p) => {
    const next = { ...p }
    // Clear nodePort so API server drops host exposure
    delete (next as { nodePort?: number }).nodePort
    return next
  })

  const body = {
    ...svc,
    spec: {
      ...svc.spec,
      type: "ClusterIP" as const,
      ports,
      // Drop LB-only fields (invalid on ClusterIP)
      allocateLoadBalancerNodePorts: undefined,
      externalIPs: undefined,
      loadBalancerIP: undefined,
      loadBalancerClass: undefined,
      externalTrafficPolicy: undefined,
      healthCheckNodePort: undefined,
    },
  }

  await core.replaceNamespacedService({ name, namespace: ns, body })

  return {
    patched: true,
    serviceName: name,
    previousType,
    message: `Patched Traefik Service/${ns}/${name} from ${previousType ?? "?"} to ClusterIP (NodePorts cleared)`,
  }
}
