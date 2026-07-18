import type { NetbirdConnectInput, NetbirdManagedDomain } from "@hostrig/shared"

import {
  getClusterSummary,
  requireConnectedKubeconfig,
} from "@/lib/k8s/cluster-store"
import { proxyService } from "@/lib/services"
import { loadIngressSettings, saveIngressSettings } from "@/lib/ingress-settings"

import {
  applyNetbirdAgent,
  NETBIRD_PEER_HOSTNAME,
  removeNetbirdAgent,
} from "./agent-manifest"
import { createNetbirdClient, type NetbirdClient } from "./client"
import {
  decryptPat,
  deleteAllNetbirdServiceMaps,
  encryptPat,
  loadNetbirdEdgeRow,
  updateNetbirdEdge,
} from "./store"

const PEER_POLL_MS = 3_000
const PEER_TIMEOUT_MS = 90_000

export async function listManagedDomains(input: {
  managementUrl: string
  pat: string
}): Promise<NetbirdManagedDomain[]> {
  const client = createNetbirdClient(input.managementUrl, input.pat)
  await client.validateToken()
  const domains = await client.listDomains()
  return domains
    .filter((d) => d.validated || d.type === "free" || d.type === "cluster")
    .map((d) => ({
      id: d.id,
      domain: d.domain,
      validated: Boolean(d.validated),
      type: d.type,
      targetCluster: d.target_cluster,
    }))
}

function dnsHintForCustom(baseDomain: string): string {
  return `Point *.${baseDomain} (CNAME or A) at your NetBird proxy cluster as shown in the NetBird dashboard (Reverse Proxy → Domains).`
}

async function waitForPeer(
  client: NetbirdClient,
  hostname: string,
): Promise<{ id: string; name: string }> {
  const deadline = Date.now() + PEER_TIMEOUT_MS
  while (Date.now() < deadline) {
    const peer = await client.findPeerByName(hostname)
    if (peer?.connected) {
      return { id: peer.id, name: peer.name || hostname }
    }
    if (peer && !peer.connected) {
      // registered but not yet connected — keep waiting
    }
    await new Promise((r) => setTimeout(r, PEER_POLL_MS))
  }
  // Accept registered-but-not-connected after timeout with softer success
  const peer = await client.findPeerByName(hostname)
  if (peer) {
    return { id: peer.id, name: peer.name || hostname }
  }
  throw new Error(
    `NetBird peer "${hostname}" did not appear within ${PEER_TIMEOUT_MS / 1000}s. Check DaemonSet logs in namespace hostrig-system.`,
  )
}

export async function connectNetbird(input: NetbirdConnectInput): Promise<{
  baseDomain: string
  peerName: string
  dnsHint: string | null
}> {
  const cluster = await getClusterSummary()
  if (cluster.status !== "connected") {
    throw new Error("Connect a k3s cluster first (Settings → Cluster).")
  }
  if (!cluster.traefikReady) {
    throw new Error(
      "Traefik was not detected on the cluster. Fix Traefik before enabling NetBird.",
    )
  }

  let baseDomain = (input.baseDomain ?? "").trim().toLowerCase()
  if (input.domainMode === "managed") {
    if (!baseDomain) {
      const domains = await listManagedDomains({
        managementUrl: input.managementUrl,
        pat: input.pat,
      })
      const pick =
        domains.find((d) => d.type === "free" || d.type === "cluster") ??
        domains[0]
      if (!pick) {
        throw new Error(
          "No NetBird-managed domains available. Enable Reverse Proxy in NetBird or choose a custom domain.",
        )
      }
      baseDomain = pick.domain
    }
  } else if (!baseDomain) {
    throw new Error("Custom domain mode requires a base domain.")
  }

  await updateNetbirdEdge({
    status: "connecting",
    statusMessage: "Validating token and creating setup key…",
    managementUrl: input.managementUrl,
    domainMode: input.domainMode,
  })

  try {
    const client = createNetbirdClient(input.managementUrl, input.pat)
    await client.validateToken()
    const group = await client.ensureHostrigGroup()
    const setupKey = await client.createSetupKey({
      name: `hostrig-${Date.now()}`,
      groupIds: [group.id],
    })
    if (!setupKey.key) {
      throw new Error("NetBird setup key response missing plaintext key.")
    }

    const kubeconfigYaml = await requireConnectedKubeconfig()
    await updateNetbirdEdge({
      status: "connecting",
      statusMessage: "Installing NetBird agent on the cluster…",
      setupKeyId: String(setupKey.id),
      patEncrypted: encryptPat(input.pat),
    })

    await applyNetbirdAgent({
      kubeconfigYaml,
      setupKey: setupKey.key,
      managementUrl: input.managementUrl,
    })

    await updateNetbirdEdge({
      status: "connecting",
      statusMessage: `Waiting for peer ${NETBIRD_PEER_HOSTNAME}…`,
    })

    const peer = await waitForPeer(client, NETBIRD_PEER_HOSTNAME)

    await updateNetbirdEdge({
      status: "connecting",
      statusMessage: "Ensuring mesh ACL for Traefik…",
    })
    try {
      await client.ensureHostrigEdgePolicy({
        hostrigGroupId: group.id,
        ports: ["80", "32323", "30000-32767"],
      })
    } catch {
      // Self-hosted NetBird may reject port ranges; retry narrow ports.
      await client.ensureHostrigEdgePolicy({
        hostrigGroupId: group.id,
        ports: ["80", "32323"],
      })
    }

    await updateNetbirdEdge({
      status: "connected",
      statusMessage: null,
      peerId: peer.id,
      peerName: peer.name,
      baseDomain,
      edgeMode: "netbird",
      autoDomainsEnabled: true,
      domainMode: input.domainMode,
      managementUrl: input.managementUrl,
      patEncrypted: encryptPat(input.pat),
      setupKeyId: String(setupKey.id),
    })

    const settings = await loadIngressSettings()
    await saveIngressSettings({
      ...settings,
      baseDomain,
      edgeMode: "netbird",
      autoDomainsEnabled: true,
      publicProtocol: "https",
    })
    proxyService.applySettings({
      baseDomain,
      autoDomainsEnabled: true,
      publicProtocol: "https",
    })

    return {
      baseDomain,
      peerName: peer.name,
      dnsHint:
        input.domainMode === "custom" ? dnsHintForCustom(baseDomain) : null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await updateNetbirdEdge({
      status: "error",
      statusMessage: message,
    })
    throw error
  }
}

export async function disconnectNetbird(): Promise<void> {
  const row = await loadNetbirdEdgeRow()
  let client: NetbirdClient | null = null
  if (row?.netbirdPatEncrypted && row.netbirdManagementUrl) {
    try {
      client = createNetbirdClient(
        row.netbirdManagementUrl,
        decryptPat(row.netbirdPatEncrypted),
      )
    } catch {
      client = null
    }
  }

  if (client) {
    const mapped = await deleteAllNetbirdServiceMaps()
    for (const m of mapped) {
      try {
        await client.deleteService(m.netbirdServiceId)
      } catch {
        // best-effort
      }
    }
    if (row?.netbirdSetupKeyId) {
      try {
        await client.deleteSetupKey(row.netbirdSetupKeyId)
      } catch {
        // best-effort
      }
    }
  } else {
    await deleteAllNetbirdServiceMaps()
  }

  try {
    const kubeconfigYaml = await requireConnectedKubeconfig()
    await removeNetbirdAgent(kubeconfigYaml)
  } catch {
    // cluster may already be disconnected
  }

  await updateNetbirdEdge({
    status: "disconnected",
    statusMessage: null,
    patEncrypted: null,
    setupKeyId: null,
    peerId: null,
    peerName: null,
    edgeMode: "local",
  })

  const settings = await loadIngressSettings()
  await saveIngressSettings({
    ...settings,
    edgeMode: "local",
  })
}
