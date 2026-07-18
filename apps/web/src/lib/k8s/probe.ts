import type { ClusterNode } from "@hostrig/shared"

import { resolveTraefikPeerPort } from "./edge/netbird/traefik-port"
import { defaultTraefikOrigin } from "./public-host"
import { apiClients, loadKubeConfig } from "./client"

export type ClusterProbe = {
  ok: boolean
  serverUrl: string | null
  externalIp: string | null
  traefikReady: boolean
  /** Origin edges should hit on the k3s server (loopback Traefik, not public IP) */
  traefikOrigin: string
  /** gVisor RuntimeClass present (required for user apps) */
  gvisorRuntimeClass: boolean
  /** Traefik Service exposes NodePort / LoadBalancer (public risk) */
  traefikPubliclyExposed: boolean
  /** Count of NetworkPolicy objects cluster-wide */
  networkPolicyCount: number
  nodes: ClusterNode[]
  message?: string
}

function nodeReady(node: {
  status?: { conditions?: Array<{ type?: string; status?: string }> }
}): boolean {
  return (
    node.status?.conditions?.some(
      (c) => c.type === "Ready" && c.status === "True",
    ) ?? false
  )
}

function nodeRoles(labels: Record<string, string> | undefined): string[] {
  if (!labels) return ["worker"]
  const roles: string[] = []
  for (const [k, v] of Object.entries(labels)) {
    if (k.startsWith("node-role.kubernetes.io/")) {
      roles.push(k.replace("node-role.kubernetes.io/", "") || v || "control-plane")
    }
  }
  return roles.length > 0 ? roles : ["worker"]
}

export async function probeCluster(kubeconfigYaml: string): Promise<ClusterProbe> {
  let traefikOrigin = defaultTraefikOrigin()
  try {
    const kc = loadKubeConfig(kubeconfigYaml)
    const { core } = apiClients(kc)
    const serverUrl = kc.getCurrentCluster()?.server ?? null

    const nodeList = await core.listNode()
    const nodes: ClusterNode[] = (nodeList.items ?? []).map((n) => {
      const addresses = n.status?.addresses ?? []
      const externalIp =
        addresses.find((a) => a.type === "ExternalIP")?.address ?? null
      const internalIp =
        addresses.find((a) => a.type === "InternalIP")?.address ?? null
      return {
        name: n.metadata?.name ?? "unknown",
        roles: nodeRoles(n.metadata?.labels as Record<string, string> | undefined),
        ready: nodeReady(n),
        version: n.status?.nodeInfo?.kubeletVersion,
        internalIp,
        externalIp,
        capacityCpu: n.status?.capacity?.cpu,
        capacityMemory: n.status?.capacity?.memory,
      }
    })

    let traefikReady = false
    let traefikPubliclyExposed = false
    try {
      const svcs = await core.listNamespacedService({
        namespace: "kube-system",
      })
      const traefikSvc = (svcs.items ?? []).find((s) =>
        (s.metadata?.name ?? "").toLowerCase().includes("traefik"),
      )
      traefikReady = Boolean(traefikSvc)
      if (!traefikReady) {
        const allNs = await core.listServiceForAllNamespaces()
        const hit = (allNs.items ?? []).find((s) =>
          (s.metadata?.name ?? "").toLowerCase().includes("traefik"),
        )
        traefikReady = Boolean(hit)
        if (hit) {
          traefikPubliclyExposed =
            hit.spec?.type === "LoadBalancer" ||
            hit.spec?.type === "NodePort" ||
            (hit.spec?.ports ?? []).some(
              (p) => typeof p.nodePort === "number" && p.nodePort > 0,
            )
        }
      } else if (traefikSvc) {
        traefikPubliclyExposed =
          traefikSvc.spec?.type === "LoadBalancer" ||
          traefikSvc.spec?.type === "NodePort" ||
          (traefikSvc.spec?.ports ?? []).some(
            (p) => typeof p.nodePort === "number" && p.nodePort > 0,
          )
      }
    } catch {
      traefikReady = false
    }

    if (traefikReady && !process.env.HOSTRIG_TRAEFIK_ORIGIN?.trim()) {
      try {
        const resolved = await resolveTraefikPeerPort(kubeconfigYaml)
        traefikOrigin = resolved.origin
      } catch {
        // keep default
      }
    }

    let gvisorRuntimeClass = false
    try {
      const { node } = apiClients(kc)
      await node.readRuntimeClass({ name: "gvisor" })
      gvisorRuntimeClass = true
    } catch {
      gvisorRuntimeClass = false
    }

    let networkPolicyCount = 0
    try {
      const { networking } = apiClients(kc)
      const nps = await networking.listNetworkPolicyForAllNamespaces()
      networkPolicyCount = nps.items?.length ?? 0
    } catch {
      networkPolicyCount = 0
    }

    // Prefer IPv4 — bare IPv6 breaks URL construction (needs brackets).
    const ipv4 = (ip: string | null | undefined) =>
      ip && !ip.includes(":") ? ip : null
    const externalIp =
      nodes.map((n) => ipv4(n.externalIp)).find(Boolean) ??
      nodes.map((n) => ipv4(n.internalIp)).find(Boolean) ??
      nodes.find((n) => n.externalIp)?.externalIp ??
      nodes.find((n) => n.roles.some((r) => r.includes("control")))
        ?.internalIp ??
      nodes[0]?.internalIp ??
      null

    return {
      ok: nodes.some((n) => n.ready),
      serverUrl,
      externalIp,
      traefikReady,
      traefikOrigin,
      gvisorRuntimeClass,
      traefikPubliclyExposed,
      networkPolicyCount,
      nodes,
    }
  } catch (e) {
    return {
      ok: false,
      serverUrl: null,
      externalIp: null,
      traefikReady: false,
      traefikOrigin,
      gvisorRuntimeClass: false,
      traefikPubliclyExposed: false,
      networkPolicyCount: 0,
      nodes: [],
      message: e instanceof Error ? e.message : String(e),
    }
  }
}
