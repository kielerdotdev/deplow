import { eq, db, deployments, projects, services } from "@deplow/db"

import { requireConnectedKubeconfig } from "@/lib/k8s/cluster-store"
import { unpublishServiceSurface } from "@/lib/k8s/surface"
import { workloadRegistry } from "@/lib/k8s/workload"

import { ServiceLifecycleError } from "./deploy"
import { transitionService } from "./transition"

export async function stopService(input: {
  serviceId: string
  deploymentId?: string
}): Promise<{ ok: true }> {
  const [service] = await db
    .select()
    .from(services)
    .where(eq(services.id, input.serviceId))
    .limit(1)
  if (!service) {
    throw new ServiceLifecycleError("Service not found", "NOT_FOUND")
  }
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, service.projectId))
    .limit(1)
  if (!project) {
    throw new ServiceLifecycleError("Project not found", "NOT_FOUND")
  }

  const driver = workloadRegistry().get(service.type)
  if (!driver?.stop) {
    throw new ServiceLifecycleError(
      `Service type ${service.type} cannot be stopped`,
    )
  }

  try {
    const kubeconfigYaml = await requireConnectedKubeconfig()
    await driver.stop({
      kubeconfigYaml,
      projectSlug: project.slug,
      serviceName: service.name,
      replicas: 0,
    })
  } catch (e) {
    throw new ServiceLifecycleError(
      e instanceof Error ? e.message : "Failed to stop on cluster",
    )
  }

  await unpublishServiceSurface(service.id)

  if (input.deploymentId) {
    await db
      .update(deployments)
      .set({ status: "stopped" })
      .where(eq(deployments.id, input.deploymentId))
  }

  await transitionService(service.id, "stopped", { publicUrl: null })
  return { ok: true as const }
}
