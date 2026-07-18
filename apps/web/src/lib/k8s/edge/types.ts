import type { PlatformEdgeMode } from "@hostrig/shared"

export type EdgeMode = PlatformEdgeMode

export type EdgePublishContext = {
  serviceId: string
  hostname: string
  kubeconfigYaml: string
}

export type EdgePublishResult = {
  created: boolean
  note: string
}

export type EdgeProviderStatus = {
  mode: EdgeMode
  ready: boolean
  message: string | null
  /** Provider-specific payload (e.g. NetBird peer fields). */
  details?: Record<string, unknown>
}

export type EdgeConnectResult = {
  baseDomain: string
  peerName?: string | null
  dnsHint?: string | null
}

/**
 * Cluster-scoped installers owned by an edge provider (agent, origin proxy, tunnel).
 */
export interface ClusterAddon {
  readonly id: string
  apply(
    kubeconfigYaml: string,
    ctx?: Record<string, unknown>,
  ): Promise<void>
  remove(kubeconfigYaml: string): Promise<void>
}

export type EdgePublicHostInput = {
  slug: string
  baseDomain: string
  publicProtocol: "http" | "https"
}

export type EdgePublicHost = {
  hostname: string
  publicUrl: string
}

export interface EdgeProvider {
  readonly mode: EdgeMode
  /** Optional cluster initializers applied/removed with connect/disconnect. */
  readonly addons?: readonly ClusterAddon[]
  status(): Promise<EdgeProviderStatus>
  connect?(input: unknown): Promise<EdgeConnectResult>
  disconnect?(): Promise<void>
  publish(ctx: EdgePublishContext): Promise<EdgePublishResult>
  unpublish(ctx: { serviceId: string }): Promise<void>
  /** Resolve Ingress Host + browser URL, or throw if this mode cannot publish. */
  resolvePublicHost(input: EdgePublicHostInput): EdgePublicHost
}
