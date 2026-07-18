import type { ProxyIngressStatus } from "@deplow/shared"

import { env } from "@/lib/env"
import {
  isLocalhostBaseDomain,
  loadIngressSettings,
} from "@/lib/ingress-settings"
import { getClusterSummary } from "@/lib/k8s/cluster-store"
import { loadNetbirdEdgeRow } from "@/lib/k8s/edge/netbird/store"
import { defaultTraefikOrigin } from "@/lib/k8s/public-host"
import { proxyService } from "@/lib/services"

/**
 * Operator-facing ingress status: base domain + Traefik/cluster + edge hints.
 */
export async function getProxyIngressStatus(): Promise<ProxyIngressStatus> {
  const settings = await loadIngressSettings()
  proxyService.applySettings(settings)

  const cluster = await getClusterSummary()
  const clusterConnected = cluster.status === "connected"
  const traefikOrigin =
    cluster.traefikOrigin || defaultTraefikOrigin()
  const localhostBlocked =
    clusterConnected && isLocalhostBaseDomain(settings.baseDomain)
  const netbird = await loadNetbirdEdgeRow()
  const netbirdReady =
    settings.edgeMode === "netbird" && netbird?.netbirdStatus === "connected"

  return {
    baseDomain: settings.baseDomain,
    baseDomainConfigured:
      settings.autoDomainsEnabled &&
      settings.baseDomain.length > 0 &&
      !isLocalhostBaseDomain(settings.baseDomain),
    publicProtocol: settings.publicProtocol,
    autoDomainsEnabled: settings.autoDomainsEnabled,
    edgeMode: settings.edgeMode,
    clusterConnected,
    traefikReady: cluster.traefikReady,
    traefikOrigin,
    hostOrigin: traefikOrigin,
    caddyOrigin: traefikOrigin,
    caddyReachable: clusterConnected && cluster.traefikReady,
    caddyMessage: clusterConnected
      ? cluster.traefikReady
        ? "Traefik Service detected in the cluster"
        : "Cluster connected but Traefik Service not found"
      : "No k3s cluster connected",
    lastReloadOk: null,
    lastReloadMessage: null,
    lastReloadAt: null,
    edgeTokenConfigured:
      Boolean(env.cloudflareTunnelToken) || netbirdReady,
    localhostBlocked,
    meshAgentsReady: false,
    meshAgentCount: 0,
  }
}
