import { isLocalhostBaseDomain } from "@/lib/ingress-settings"

import { edgeRegistry } from "./edge/registry"

/**
 * Resolve Ingress Host + browser URL for a k3s web service via the active edge provider.
 */
export function resolveK8sPublicHost(input: {
  slug: string
  baseDomain: string
  publicProtocol: "http" | "https"
  edgeMode: "cloudflare" | "netbird" | "tailscale" | "local"
}): { hostname: string; publicUrl: string } {
  const base = input.baseDomain.trim().toLowerCase()
  if (!base || isLocalhostBaseDomain(base)) {
    throw new Error(
      "Set a real base domain under Domains (not apps.localhost), then point Cloudflare Tunnel, Netbird RP, or Tailscale Serve at Traefik on the k3s server.",
    )
  }
  return edgeRegistry().get(input.edgeMode).resolvePublicHost({
    slug: input.slug,
    baseDomain: base,
    publicProtocol: input.publicProtocol,
  })
}

export function defaultTraefikOrigin(): string {
  return process.env.HOSTRIG_TRAEFIK_ORIGIN?.trim() || "http://127.0.0.1:80"
}

export function edgeSetupCommands(
  traefikOrigin: string,
  baseDomain?: string,
): {
  netbird: string
  tailscale: string
  cloudflareOrigin: string
} {
  const origin = traefikOrigin.replace(/\/$/, "")
  const wildcard = baseDomain?.trim()
    ? `*.${baseDomain.trim()}`
    : "*.{baseDomain}"
  return {
    netbird: `# On the k3s server: Netbird reverse proxy → ${origin}\n# Public hostname: ${wildcard}`,
    tailscale: `tailscale serve --bg ${origin}`,
    cloudflareOrigin: origin,
  }
}
