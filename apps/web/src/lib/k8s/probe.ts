import type { ClusterNode } from "@deplow/shared"

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
    try {
      const svcs = await core.listNamespacedService({
        namespace: "kube-system",
      })
      traefikReady = (svcs.items ?? []).some((s) =>
        (s.metadata?.name ?? "").includes("traefik"),
      )
      if (!traefikReady) {
        const allNs = await core.listServiceForAllNamespaces()
        traefikReady = (allNs.items ?? []).some((s) =>
          (s.metadata?.name ?? "").includes("traefik"),
        )
      }
    } catch {
      traefikReady = false
    }

    if (traefikReady && !process.env.DEPLOW_TRAEFIK_ORIGIN?.trim()) {
      try {
        const resolved = await resolveTraefikPeerPort(kubeconfigYaml)
        traefikOrigin = resolved.origin
      } catch {
        // keep default
      }
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
      nodes,
    }
  } catch (e) {
    return {
      ok: false,
      serverUrl: null,
      externalIp: null,
      traefikReady: false,
      traefikOrigin,
      nodes: [],
      message: e instanceof Error ? e.message : String(e),
    }
  }
}
