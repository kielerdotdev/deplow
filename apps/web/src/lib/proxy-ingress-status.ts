import type { ProxyIngressStatus } from "@deplow/shared"

import { getLastCaddyReload, probeCaddyProxy } from "@/lib/core"
import { env } from "@/lib/env"
import { loadIngressSettings } from "@/lib/ingress-settings"
import { proxyService } from "@/lib/services"

/** Compose-network origin — Cloudflare Tunnel and in-network edges use this. */
export const CADDY_ORIGIN = "http://caddy:80"
/** Host-published origin — Tailscale Serve, Netbird, local curl. */
export const HOST_ORIGIN = "http://127.0.0.1:8088"

/**
 * Operator-facing ingress status: base domain + Caddy health + last reload.
 * Edges (cloudflared / Tailscale / Netbird) all forward to the same Caddy origin.
 */
export async function getProxyIngressStatus(): Promise<ProxyIngressStatus> {
  const settings = await loadIngressSettings()
  proxyService.applySettings(settings)

  const containerName = process.env.DEPLOW_CADDY_CONTAINER ?? "deplow-caddy"
  const probe = await probeCaddyProxy({ containerName })
  const last = getLastCaddyReload()

  return {
    baseDomain: settings.baseDomain,
    baseDomainConfigured:
      settings.autoDomainsEnabled && settings.baseDomain.length > 0,
    publicProtocol: settings.publicProtocol,
    autoDomainsEnabled: settings.autoDomainsEnabled,
    caddyOrigin: CADDY_ORIGIN,
    hostOrigin: HOST_ORIGIN,
    caddyReachable: probe.reachable,
    caddyMessage: probe.message,
    lastReloadOk: last?.ok ?? null,
    lastReloadMessage: last?.message ?? null,
    lastReloadAt: last?.at ?? null,
    edgeTokenConfigured: Boolean(env.cloudflareTunnelToken),
  }
}
