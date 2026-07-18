import type {
  EdgeConnectResult,
  EdgeProvider,
  EdgeProviderStatus,
  EdgePublicHost,
  EdgePublicHostInput,
  EdgePublishContext,
  EdgePublishResult,
  EdgeMode,
} from "./types"

function hostnameFor(input: EdgePublicHostInput): string {
  return `${input.slug.trim().toLowerCase()}.${input.baseDomain.trim().toLowerCase()}`
}

/** Recipe-only / local edges: no automated publish or cluster addons yet. */
export class NoopEdgeProvider implements EdgeProvider {
  constructor(readonly mode: EdgeMode) {}

  async status(): Promise<EdgeProviderStatus> {
    return {
      mode: this.mode,
      ready: true,
      message: null,
    }
  }

  async connect(_input: unknown): Promise<EdgeConnectResult> {
    throw new Error(
      `Edge mode "${this.mode}" has no guided connect — use the Networking recipes.`,
    )
  }

  async disconnect(): Promise<void> {
    // nothing installed
  }

  async publish(_ctx: EdgePublishContext): Promise<EdgePublishResult> {
    return { created: false, note: "" }
  }

  async unpublish(_ctx: { serviceId: string }): Promise<void> {
    // nothing published
  }

  resolvePublicHost(input: EdgePublicHostInput): EdgePublicHost {
    if (this.mode === "local") {
      throw new Error(
        "Local edge mode cannot publish remote k3s apps. Switch Domains to Cloudflare, Netbird, or Tailscale.",
      )
    }
    const hostname = hostnameFor(input)
    return {
      hostname,
      publicUrl: `${input.publicProtocol}://${hostname}`,
    }
  }
}
