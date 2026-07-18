import type { NetbirdEdgeStatus, NetbirdDomainMode, NetbirdStatus } from "@hostrig/shared"

import { getClusterSummary } from "@/lib/k8s/cluster-store"

import { createNetbirdClient } from "./client"
import { decryptPat, loadNetbirdEdgeRow } from "./store"

function asDomainMode(raw: string | null | undefined): NetbirdDomainMode {
  return raw === "custom" ? "custom" : "managed"
}

function asStatus(raw: string | null | undefined): NetbirdStatus {
  if (
    raw === "connecting" ||
    raw === "connected" ||
    raw === "error" ||
    raw === "disconnected"
  ) {
    return raw
  }
  return "disconnected"
}

export async function getNetbirdEdgeStatus(): Promise<NetbirdEdgeStatus> {
  const cluster = await getClusterSummary()
  const row = await loadNetbirdEdgeRow()
  const managementUrl =
    row?.netbirdManagementUrl?.trim() || "https://api.netbird.io"
  const hasPat = Boolean(row?.netbirdPatEncrypted)
  let peerConnected: boolean | null = null

  if (
    hasPat &&
    row?.netbirdPatEncrypted &&
    row.netbirdPeerId &&
    row.netbirdStatus === "connected"
  ) {
    try {
      const client = createNetbirdClient(
        managementUrl,
        decryptPat(row.netbirdPatEncrypted),
      )
      const peers = await client.listPeers()
      const peer = peers.find((p) => p.id === row.netbirdPeerId)
      peerConnected = peer ? Boolean(peer.connected) : false
    } catch {
      peerConnected = null
    }
  }

  const domainMode = asDomainMode(row?.netbirdDomainMode)
  const baseDomain = row?.baseDomain ?? ""
  const dnsHint =
    domainMode === "custom" && baseDomain
      ? `Point *.${baseDomain} at your NetBird proxy cluster (see NetBird → Reverse Proxy → Domains).`
      : null

  return {
    status: asStatus(row?.netbirdStatus),
    statusMessage: row?.netbirdStatusMessage ?? null,
    managementUrl,
    domainMode,
    baseDomain,
    peerId: row?.netbirdPeerId ?? null,
    peerName: row?.netbirdPeerName ?? null,
    peerConnected,
    hasPat,
    dnsHint,
    clusterReady: cluster.status === "connected",
    traefikReady: cluster.traefikReady,
  }
}
