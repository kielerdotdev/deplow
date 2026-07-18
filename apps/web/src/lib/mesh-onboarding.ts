import type { MeshOnboardingHint } from "@deplow/shared"

import {
  isLocalhostBaseDomain,
  loadIngressSettings,
} from "@/lib/ingress-settings"
import { getClusterSummary } from "@/lib/k8s/cluster-store"

/**
 * Project-page hint when cluster apps need a real Domains edge (not localhost).
 */
export async function getMeshOnboardingHint(): Promise<MeshOnboardingHint> {
  const settings = await loadIngressSettings()
  const cluster = await getClusterSummary()
  const clusterConnected = cluster.status === "connected"
  const localhost = isLocalhostBaseDomain(settings.baseDomain)

  let showMeshBanner = false
  let reason: MeshOnboardingHint["reason"] = "none"

  if (clusterConnected && localhost) {
    showMeshBanner = true
    reason = "localhost_with_cluster"
  } else if (
    clusterConnected &&
    settings.edgeMode === "local" &&
    settings.autoDomainsEnabled &&
    settings.baseDomain.trim().length > 0
  ) {
    showMeshBanner = true
    reason = "localhost_with_cluster"
  }

  return {
    showMeshBanner,
    reason,
    meshAgentCount: 0,
    onlineAgentCount: 0,
    edgeMode: settings.edgeMode,
    baseDomain: settings.baseDomain,
    clusterConnected,
  }
}
