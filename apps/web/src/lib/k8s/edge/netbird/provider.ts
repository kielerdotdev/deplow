import type {
  NetbirdConnectInput,
  NetbirdEdgeStatus,
} from "@hostrig/shared"

import {
  applyNetbirdAgent,
  removeNetbirdAgent,
} from "./agent-manifest"
import {
  connectNetbird,
  disconnectNetbird,
} from "./connect"
import { syncNetbirdService } from "./sync-service"
import { getNetbirdEdgeStatus } from "./status"
import { unsyncNetbirdForService } from "./unsync-service"
import type {
  ClusterAddon,
  EdgeConnectResult,
  EdgeProvider,
  EdgeProviderStatus,
  EdgePublicHost,
  EdgePublicHostInput,
  EdgePublishContext,
  EdgePublishResult,
} from "../types"

export class NetbirdEdgeProvider implements EdgeProvider {
  readonly mode = "netbird" as const

  readonly addons: readonly ClusterAddon[] = [
    {
      id: "netbird-edge",
      async apply(kubeconfigYaml, ctx) {
        const setupKey = String(ctx?.setupKey ?? "")
        const managementUrl = String(ctx?.managementUrl ?? "")
        if (!setupKey || !managementUrl) {
          throw new Error(
            "NetBird edge addon requires setupKey and managementUrl",
          )
        }
        await applyNetbirdAgent({
          kubeconfigYaml,
          setupKey,
          managementUrl,
        })
      },
      remove: removeNetbirdAgent,
    },
  ]

  async status(): Promise<EdgeProviderStatus> {
    const details: NetbirdEdgeStatus = await getNetbirdEdgeStatus()
    return {
      mode: this.mode,
      ready: details.status === "connected" && Boolean(details.peerConnected),
      message: details.statusMessage,
      details: details as unknown as Record<string, unknown>,
    }
  }

  async connect(input: unknown): Promise<EdgeConnectResult> {
    const result = await connectNetbird(input as NetbirdConnectInput)
    return {
      baseDomain: result.baseDomain,
      peerName: result.peerName,
      dnsHint: result.dnsHint,
    }
  }

  async disconnect(): Promise<void> {
    await disconnectNetbird()
  }

  async publish(ctx: EdgePublishContext): Promise<EdgePublishResult> {
    const synced = await syncNetbirdService({
      hostname: ctx.hostname,
      serviceId: ctx.serviceId,
    })
    return {
      created: synced.created,
      note: synced.created
        ? `\nNetBird: created reverse-proxy service for ${ctx.hostname}`
        : `\nNetBird: updated reverse-proxy service for ${ctx.hostname}`,
    }
  }

  async unpublish(ctx: { serviceId: string }): Promise<void> {
    await unsyncNetbirdForService(ctx.serviceId)
  }

  resolvePublicHost(input: EdgePublicHostInput): EdgePublicHost {
    const hostname = `${input.slug.trim().toLowerCase()}.${input.baseDomain.trim().toLowerCase()}`
    return {
      hostname,
      publicUrl: `${input.publicProtocol}://${hostname}`,
    }
  }
}
