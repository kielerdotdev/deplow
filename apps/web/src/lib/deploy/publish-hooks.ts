import { loadIngressSettings } from "@/lib/ingress-settings"
import {
  listActiveHostnames,
  upsertAutoHostname,
} from "@/lib/service-hostnames"
import { proxyService } from "@/lib/services"

import { publishEdgeHostname } from "@/lib/k8s/surface"

export type DeployPublishContext = {
  serviceId: string
  projectSlug: string
  serviceName: string
  isPrimary: boolean
  serviceType: string
  /** When set, edge publish runs (k3s path). */
  kubeconfigYaml?: string
  /** When set, Caddy/proxy route is upserted (agent/Docker path). */
  upstream?: string | null
  /** Skip CP Caddy when mesh/local proxy already applied on the node. */
  skipProxyRoute?: boolean
}

export type DeployPublishResult = {
  publicUrl: string | null
  note: string
}

export interface DeployPublishHook {
  readonly id: string
  afterReady(ctx: DeployPublishContext): Promise<DeployPublishResult>
}

/** Hostname rows + optional proxy route + optional edge publish. */
export class DefaultDeployPublishHook implements DeployPublishHook {
  readonly id = "default-publish"

  async afterReady(ctx: DeployPublishContext): Promise<DeployPublishResult> {
    if (ctx.serviceType !== "web") {
      return { publicUrl: null, note: "" }
    }

    const auto = await upsertAutoHostname({
      serviceId: ctx.serviceId,
      projectSlug: ctx.projectSlug,
      serviceName: ctx.serviceName,
      isPrimary: ctx.isPrimary,
      proxy: proxyService,
    })
    let publicUrl = auto.publicUrl
    let note = ""

    const hostnames = await listActiveHostnames(ctx.serviceId)
    if (
      hostnames.length > 0 &&
      ctx.upstream &&
      !ctx.skipProxyRoute
    ) {
      const route = await proxyService.upsertServiceRoute({
        serviceId: ctx.serviceId,
        projectSlug: ctx.projectSlug,
        serviceName: ctx.serviceName,
        isPrimary: ctx.isPrimary,
        upstream: ctx.upstream,
        hostnames,
      })
      publicUrl = auto.publicUrl ?? route.publicUrl
    } else if (hostnames.length === 0 && ctx.upstream !== undefined) {
      await proxyService.removeServiceRoute(ctx.serviceId).catch(() => undefined)
      publicUrl = null
    }

    const hostname = auto.hostname ?? hostnames[0] ?? null
    if (hostname && ctx.kubeconfigYaml) {
      const ingress = await loadIngressSettings()
      if (ingress.edgeMode !== "local") {
        const published = await publishEdgeHostname({
          serviceId: ctx.serviceId,
          hostname,
          kubeconfigYaml: ctx.kubeconfigYaml,
        })
        note = published.note
      }
    }

    return { publicUrl, note }
  }
}

let hooks: DeployPublishHook[] | null = null

export function deployPublishHooks(): DeployPublishHook[] {
  if (!hooks) hooks = [new DefaultDeployPublishHook()]
  return hooks
}

export async function runDeployPublishHooks(
  ctx: DeployPublishContext,
): Promise<DeployPublishResult> {
  let publicUrl: string | null = null
  let note = ""
  for (const hook of deployPublishHooks()) {
    const result = await hook.afterReady(ctx)
    publicUrl = result.publicUrl ?? publicUrl
    note += result.note
  }
  return { publicUrl, note }
}
