import { eq } from "@deplow/db"

import {
  markOperationFailed,
  markOperationRunning,
  markOperationSucceeded,
} from "@/lib/core/queue/operations"
import type { ProvisionJobData } from "@/lib/core/queue"
import {
  markServiceProvisionFailed,
  markServiceProvisionSucceeded,
  markServiceProvisioning,
} from "@/lib/service-lifecycle/completion"
import {
  db,
  projects,
  resourceLinkService,
  services,
} from "@/lib/services"

export async function processProvisionJob(
  data: ProvisionJobData,
): Promise<void> {
  const { operationId, serviceId } = data
  await markOperationRunning(operationId, "provisioning")

  const [service] = await db
    .select()
    .from(services)
    .where(eq(services.id, serviceId))
  if (!service) {
    await markOperationFailed(operationId, {
      message: "Service not found",
      code: "not_found",
    })
    return
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, service.projectId))
  if (!project) {
    await markOperationFailed(operationId, {
      message: "Project not found",
      code: "not_found",
    })
    return
  }

  const { workloadRegistry } = await import("@/lib/k8s/workload")
  const driver = workloadRegistry().get(service.type)
  if (!driver?.provision) {
    await markOperationFailed(operationId, {
      message: `Cannot provision service type ${service.type}`,
      code: "invalid_type",
    })
    return
  }

  await markServiceProvisioning(service.id)

  try {
    const { requireConnectedKubeconfig } = await import(
      "@/lib/k8s/cluster-store"
    )
    const kubeconfigYaml = await requireConnectedKubeconfig()
    const creds = await driver.provision({
      kubeconfigYaml,
      projectSlug: project.slug,
      serviceName: service.name,
      serviceId: service.id,
      projectId: project.id,
    })
    if (!creds) {
      throw new Error("Provision returned no credentials")
    }
    const credentialsEncrypted = resourceLinkService.encrypt(creds)
    await markServiceProvisionSucceeded({
      serviceId: service.id,
      operationId,
      credentialsEncrypted,
    })
    await markOperationSucceeded(operationId, { serviceId: service.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await markServiceProvisionFailed({
      serviceId: service.id,
      operationId,
      message,
    })
    await markOperationFailed(operationId, {
      message,
      code: "provision_failed",
      rootCause: message,
      symptom: "Provisioning failed",
      stage: "provisioning",
    })
  }
}
