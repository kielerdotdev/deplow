import { and, eq, inArray, db, operations, projects, services } from "@hostrig/db"

import {
  createOperation,
  markOperationFailed,
  markOperationSucceeded,
} from "@/lib/core/queue/operations"
import { decryptString } from "@/lib/core"
import { destroyWorkload } from "@/lib/k8s/surface"
import { deleteServiceWebhook } from "@/lib/register-service-webhook"
import { platformConfig } from "@/lib/services"

import { ServiceLifecycleError } from "./deploy"
import { transitionService, transitionServiceBestEffort } from "./transition"

export type DestroyServiceLifecycleInput = {
  serviceId: string
  userId?: string
  /** Skip primary/bound guards (project destroy). */
  force?: boolean
}

/**
 * Full service teardown: destroying → webhook → unpublish → workload → cancel ops → delete row.
 */
export async function destroyServiceLifecycle(
  input: DestroyServiceLifecycleInput,
): Promise<{ ok: true }> {
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

  if (!input.force && service.isPrimary) {
    const siblings = await db
      .select()
      .from(services)
      .where(eq(services.projectId, project.id))
    if (siblings.length > 1) {
      throw new ServiceLifecycleError(
        "Choose another primary service before deleting this one",
      )
    }
  }

  if (!input.force) {
    const { serviceBindings } = await import("@hostrig/db")
    const bound = await db
      .select()
      .from(serviceBindings)
      .where(eq(serviceBindings.providerServiceId, service.id))
    if (bound.length > 0) {
      throw new ServiceLifecycleError(
        `Unbind ${bound.length} consumer(s) before destroying this resource`,
      )
    }
  }

  const operation = await createOperation({
    projectId: project.id,
    serviceId: service.id,
    type: "destroy",
    triggeredBy: "manual",
    stage: "destroying",
  })

  await transitionService(service.id, "destroying", {
    lastOperationId: operation.id,
    errorMessage: null,
    errorCode: null,
  })

  try {
    if (input.userId) {
      await deleteServiceWebhook({
        userId: input.userId,
        provider: (service.gitProvider as "github" | "gitlab" | null) ?? null,
        repoUrl: service.gitRepoUrl,
        repoFullName: service.gitRepoFullName,
        installationId: service.gitInstallationId,
        accessTokenEncrypted: service.gitAccessTokenEncrypted,
        remoteWebhookId: service.gitRemoteWebhookId,
        decryptAccessToken: (encrypted) =>
          decryptString(encrypted, platformConfig.secretsEncryptionKey),
      }).catch(() => undefined)
    }

    await destroyWorkload({
      serviceId: service.id,
      serviceName: service.name,
      serviceType: service.type,
      projectSlug: project.slug,
    })

    const open = await db
      .select({ id: operations.id })
      .from(operations)
      .where(
        and(
          eq(operations.serviceId, service.id),
          inArray(operations.status, ["created", "queued", "running"]),
        ),
      )
    for (const op of open) {
      if (op.id === operation.id) continue
      await markOperationFailed(op.id, {
        message: "Cancelled: service destroyed",
        code: "cancelled",
      }).catch(() => undefined)
    }

    await db.delete(services).where(eq(services.id, service.id))
    await markOperationSucceeded(operation.id, { serviceId: service.id })
    return { ok: true as const }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await markOperationFailed(operation.id, {
      message,
      code: "destroy_failed",
    }).catch(() => undefined)
    await transitionServiceBestEffort(service.id, "error", {
      errorMessage: message,
      errorCode: "destroy_failed",
      lastOperationId: operation.id,
    })
    throw e instanceof ServiceLifecycleError
      ? e
      : new ServiceLifecycleError(message)
  }
}
