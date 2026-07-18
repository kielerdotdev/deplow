import { ORPCError } from "@orpc/server"
import { updateIngressSettingsInputSchema } from "@deplow/shared"

import { assertInstanceAdmin } from "@/lib/access"
import {
  isLocalhostBaseDomain,
  loadIngressSettings,
  saveIngressSettings,
} from "@/lib/ingress-settings"
import { getMeshOnboardingHint } from "@/lib/mesh-onboarding"
import { getProxyIngressStatus } from "@/lib/proxy-ingress-status"
import { rebuildAutoHostnames } from "@/lib/service-hostnames"
import { proxyService } from "@/lib/services"

import { authedProcedure } from "./middleware"

export const proxyStatus = authedProcedure.handler(async ({ context }) => {
  await assertInstanceAdmin(context.session!)
  return getProxyIngressStatus()
})

/** Any signed-in user — project banner when cluster/domains need setup. */
export const meshOnboarding = authedProcedure.handler(async () => {
  return getMeshOnboardingHint()
})

export const ingressGet = authedProcedure.handler(async ({ context }) => {
  await assertInstanceAdmin(context.session!)
  const settings = await loadIngressSettings()
  proxyService.applySettings(settings)
  return settings
})

export const ingressUpdate = authedProcedure
  .input(updateIngressSettingsInputSchema)
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    const status = await getProxyIngressStatus()
    if (
      status.clusterConnected &&
      isLocalhostBaseDomain(input.baseDomain)
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "apps.localhost cannot reach a remote k3s cluster. Set a real base domain and point Cloudflare Tunnel, Netbird RP, or Tailscale Serve at Traefik on the k3s server.",
      })
    }
    if (
      status.clusterConnected &&
      input.edgeMode === "local" &&
      input.autoDomainsEnabled &&
      input.baseDomain.trim().length > 0
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Local edge mode cannot publish remote k3s apps. Choose Cloudflare, Netbird, or Tailscale.",
      })
    }
    const settings = await saveIngressSettings(input)
    proxyService.applySettings(settings)
    await rebuildAutoHostnames(proxyService)
    return settings
  })
