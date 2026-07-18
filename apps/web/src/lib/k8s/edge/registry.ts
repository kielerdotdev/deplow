import type { IngressSettings, PlatformEdgeMode } from "@deplow/shared"

import { NetbirdEdgeProvider } from "./netbird/provider"
import { NoopEdgeProvider } from "./noop-provider"
import type { EdgeProvider } from "./types"

export class EdgeRegistry {
  private readonly providers: Map<PlatformEdgeMode, EdgeProvider>

  constructor(providers?: EdgeProvider[]) {
    const list =
      providers ??
      ([
        new NetbirdEdgeProvider(),
        new NoopEdgeProvider("local"),
        new NoopEdgeProvider("cloudflare"),
        new NoopEdgeProvider("tailscale"),
      ] satisfies EdgeProvider[])
    this.providers = new Map(list.map((p) => [p.mode, p]))
  }

  get(mode: PlatformEdgeMode): EdgeProvider {
    const provider = this.providers.get(mode)
    if (!provider) {
      throw new Error(`No edge provider for mode: ${mode}`)
    }
    return provider
  }

  active(settings: Pick<IngressSettings, "edgeMode">): EdgeProvider {
    return this.get(settings.edgeMode)
  }

  all(): EdgeProvider[] {
    return [...this.providers.values()]
  }
}

let singleton: EdgeRegistry | null = null

export function edgeRegistry(): EdgeRegistry {
  if (!singleton) singleton = new EdgeRegistry()
  return singleton
}

/** Test helper */
export function resetEdgeRegistryForTests(): void {
  singleton = null
}
