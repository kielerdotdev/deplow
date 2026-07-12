import { ORPCError } from "@orpc/server"
import {
  updateIngressSettingsInputSchema,
  updateOperatorWebhookInputSchema,
} from "@deplow/shared"

import { assertInstanceAdmin } from "@/lib/access"
import { loadIngressSettings, saveIngressSettings } from "@/lib/ingress-settings"
import {
  loadOperatorWebhookSettings,
  saveOperatorWebhookSettings,
} from "@/lib/operator-webhook-settings"
import { getProxyIngressStatus } from "@/lib/proxy-ingress-status"
import { rebuildAutoHostnames } from "@/lib/service-hostnames"
import { proxyService } from "@/lib/services"

import { authedProcedure } from "./middleware"

export const proxyStatus = authedProcedure.handler(async ({ context }) => {
  await assertInstanceAdmin(context.session!)
  return getProxyIngressStatus()
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
    const settings = await saveIngressSettings(input)
    proxyService.applySettings(settings)
    await rebuildAutoHostnames(proxyService)
    return settings
  })

export const operatorWebhookGet = authedProcedure.handler(async ({ context }) => {
  await assertInstanceAdmin(context.session!)
  return loadOperatorWebhookSettings()
})

export const operatorWebhookUpdate = authedProcedure
  .input(updateOperatorWebhookInputSchema)
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    if (input.enabled && !input.url) {
      throw new ORPCError("BAD_REQUEST", {
        message: "URL is required when the webhook is enabled",
      })
    }
    return saveOperatorWebhookSettings(input)
  })
