/**
 * Persist and sync service_hostnames with Caddy routes.
 */

import { and, db, eq, serviceHostnames, services, projects } from "@hostrig/db"

import {
  productionHostname,
} from "@/lib/core/proxy-hostname"
import type { ProxyService } from "@/lib/core/proxy.service"
import { loadIngressSettings } from "@/lib/ingress-settings"

export async function listActiveHostnames(
  serviceId: string,
): Promise<string[]> {
  const rows = await db
    .select()
    .from(serviceHostnames)
    .where(
      and(
        eq(serviceHostnames.serviceId, serviceId),
        eq(serviceHostnames.status, "active"),
      ),
    )
  // Primary first, then others
  rows.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  return rows.map((r) => r.hostname)
}

export async function upsertAutoHostname(input: {
  serviceId: string
  projectSlug: string
  serviceName: string
  isPrimary: boolean
  proxy: ProxyService
}): Promise<{ hostname: string | null; publicUrl: string | null }> {
  const settings = await loadIngressSettings()
  input.proxy.applySettings(settings)

  if (!settings.autoDomainsEnabled || !settings.baseDomain) {
    await removeAutoHostname(input.serviceId)
    return { hostname: null, publicUrl: null }
  }

  const slug = input.isPrimary
    ? input.projectSlug
    : `${input.projectSlug}-${input.serviceName}`
  const hostname = productionHostname(slug, settings.baseDomain)
  const publicUrl = input.proxy.publicUrlForHostname(hostname)

  const [existing] = await db
    .select()
    .from(serviceHostnames)
    .where(
      and(
        eq(serviceHostnames.serviceId, input.serviceId),
        eq(serviceHostnames.kind, "auto"),
      ),
    )

  if (existing) {
    await db
      .update(serviceHostnames)
      .set({
        hostname,
        isPrimary: true,
        status: "active",
        previewKey: null,
      })
      .where(eq(serviceHostnames.id, existing.id))
  } else {
    await db.insert(serviceHostnames).values({
      id: crypto.randomUUID(),
      serviceId: input.serviceId,
      hostname,
      kind: "auto",
      isPrimary: true,
      status: "active",
    })
  }

  await db
    .update(serviceHostnames)
    .set({ isPrimary: false })
    .where(
      and(
        eq(serviceHostnames.serviceId, input.serviceId),
        eq(serviceHostnames.kind, "custom"),
      ),
    )
  await db
    .update(serviceHostnames)
    .set({ isPrimary: false })
    .where(
      and(
        eq(serviceHostnames.serviceId, input.serviceId),
        eq(serviceHostnames.kind, "preview"),
      ),
    )

  // Re-assert auto as primary
  await db
    .update(serviceHostnames)
    .set({ isPrimary: true })
    .where(
      and(
        eq(serviceHostnames.serviceId, input.serviceId),
        eq(serviceHostnames.kind, "auto"),
      ),
    )

  return { hostname, publicUrl }
}

export async function removeAutoHostname(serviceId: string): Promise<void> {
  await db
    .delete(serviceHostnames)
    .where(
      and(
        eq(serviceHostnames.serviceId, serviceId),
        eq(serviceHostnames.kind, "auto"),
      ),
    )
}

export async function removeAllHostnames(serviceId: string): Promise<void> {
  await db
    .delete(serviceHostnames)
    .where(eq(serviceHostnames.serviceId, serviceId))
}

/**
 * After ingress settings change: rewrite all auto hostnames and Caddy routes
 * for running web services that have an upstream route in memory or container.
 */
export async function rebuildAutoHostnames(proxy: ProxyService): Promise<void> {
  const settings = await loadIngressSettings()
  proxy.applySettings(settings)

  const webServices = await db
    .select({
      service: services,
      projectSlug: projects.slug,
    })
    .from(services)
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(eq(services.type, "web"))

  for (const { service, projectSlug } of webServices) {
    const existingRoute = proxy.getRoute(service.id)

    if (!settings.autoDomainsEnabled || !settings.baseDomain) {
      await removeAutoHostname(service.id)
      const hosts = await listActiveHostnames(service.id)
      if (existingRoute && hosts.length > 0) {
        await proxy.upsertProductionRoute({
          projectId: service.id,
          slug: service.isPrimary
            ? projectSlug
            : `${projectSlug}-${service.name}`,
          upstream: existingRoute.upstream,
          hostnames: hosts,
        })
      } else if (existingRoute) {
        await proxy.removeServiceRoute(service.id)
      }
      await db
        .update(services)
        .set({
          publicUrl:
            hosts.length > 0
              ? proxy.publicUrlForHostname(hosts[0]!)
              : null,
        })
        .where(eq(services.id, service.id))
      continue
    }

    const { publicUrl } = await upsertAutoHostname({
      serviceId: service.id,
      projectSlug,
      serviceName: service.name,
      isPrimary: service.isPrimary,
      proxy,
    })
    const hosts = await listActiveHostnames(service.id)

    if (existingRoute) {
      await proxy.upsertProductionRoute({
        projectId: service.id,
        slug: service.isPrimary
          ? projectSlug
          : `${projectSlug}-${service.name}`,
        upstream: existingRoute.upstream,
        hostnames: hosts,
      })
    } else if (service.status === "running" && service.containerId && hosts.length > 0) {
      // Route missing in memory but service running — skip until next deploy
      // unless we have hostnames to record; publicUrl still updated
    }

    await db
      .update(services)
      .set({ publicUrl })
      .where(eq(services.id, service.id))
  }
}
