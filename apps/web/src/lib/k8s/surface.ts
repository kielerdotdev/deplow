import { loadIngressSettings } from "@/lib/ingress-settings"
import { proxyService } from "@/lib/services"
import { removeAllHostnames } from "@/lib/service-hostnames"

import { getClusterRow, requireConnectedKubeconfig } from "./cluster-store"
import { edgeRegistry } from "./edge/registry"
import { workloadRegistry } from "./workload/registry"

export type DestroyWorkloadInput = {
  serviceId: string
  serviceName: string
  serviceType: string
  projectSlug: string
}

/**
 * Drop public surface: proxy route, active edge publish, hostnames.
 * Shared by stop and destroy so cleanup cannot drift.
 */
export async function unpublishServiceSurface(
  serviceId: string,
): Promise<void> {
  await proxyService.removeServiceRoute(serviceId).catch(() => undefined)

  const ingress = await loadIngressSettings()
  await edgeRegistry()
    .active(ingress)
    .unpublish({ serviceId })
    .catch(() => undefined)

  await removeAllHostnames(serviceId).catch(() => undefined)
}

/**
 * Tear down public surface + cluster workload.
 * Does not delete the services DB row — callers own persistence.
 *
 * When no kubeconfig is stored, skips cluster teardown (control-plane-only cleanup).
 * When a cluster is configured, destroy failures propagate so callers do not delete rows.
 */
export async function destroyWorkload(
  input: DestroyWorkloadInput,
): Promise<void> {
  await unpublishServiceSurface(input.serviceId)

  const driver = workloadRegistry().get(input.serviceType)
  if (!driver) return

  const row = await getClusterRow()
  if (!row?.kubeconfigEncrypted) {
    // No cluster configured — nothing to tear down in-cluster.
    return
  }

  const kubeconfigYaml = await requireConnectedKubeconfig()
  await driver.destroy({
    kubeconfigYaml,
    projectSlug: input.projectSlug,
    serviceName: input.serviceName,
    serviceId: input.serviceId,
  })
}

/** @deprecated Use destroyWorkload */
export const destroyService = destroyWorkload

/**
 * Publish hostname through the active edge provider after a successful deploy.
 */
export async function publishEdgeHostname(input: {
  serviceId: string
  hostname: string
  kubeconfigYaml: string
}): Promise<{ note: string }> {
  const ingress = await loadIngressSettings()
  const result = await edgeRegistry().active(ingress).publish({
    serviceId: input.serviceId,
    hostname: input.hostname,
    kubeconfigYaml: input.kubeconfigYaml,
  })
  return { note: result.note }
}
