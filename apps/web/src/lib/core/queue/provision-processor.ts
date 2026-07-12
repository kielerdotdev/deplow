import { eq } from "@deplow/db"
import type { ResourceKind } from "@deplow/shared"

import {
  markOperationFailed,
  markOperationRunning,
  markOperationSucceeded,
} from "@/lib/core/queue/operations"
import type { ProvisionJobData } from "@/lib/core/queue"
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
  if (service.type !== "postgres" && service.type !== "redis") {
    await markOperationFailed(operationId, {
      message: `Cannot provision service type ${service.type}`,
      code: "invalid_type",
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

  await db
    .update(services)
    .set({ status: "provisioning", errorMessage: null, errorCode: null })
    .where(eq(services.id, service.id))

  try {
    const kind = service.type as ResourceKind
    const credentialsEncrypted = await resourceLinkService.provision(
      kind,
      project.slug,
      {
        projectId: project.id,
        resourceLinkId: service.legacyResourceLinkId ?? service.id,
      },
    )
    await db
      .update(services)
      .set({
        status: "running",
        credentialsEncrypted,
        errorMessage: null,
        errorCode: null,
        lastOperationId: operationId,
      })
      .where(eq(services.id, service.id))
    await markOperationSucceeded(operationId, { serviceId: service.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(services)
      .set({
        status: "error",
        errorMessage: message,
        errorCode: "provision_failed",
        lastOperationId: operationId,
      })
      .where(eq(services.id, service.id))
    await markOperationFailed(operationId, {
      message,
      code: "provision_failed",
      rootCause: message,
      symptom: "Provisioning failed",
      stage: "provisioning",
    })
  }
}
