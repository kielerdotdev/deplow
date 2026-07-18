/**
 * Shared deploy/provision completion helpers — single status writer for finalizers.
 */

import { eq, db, services } from "@hostrig/db"

import { transitionService, transitionServiceBestEffort } from "./transition"

export async function markServiceDeploySucceeded(input: {
  serviceId: string
  operationId: string
  publicUrl?: string | null
  image?: string | null
  containerId?: string | null
}): Promise<void> {
  const [row] = await db
    .select({ lastOperationId: services.lastOperationId })
    .from(services)
    .where(eq(services.id, input.serviceId))
    .limit(1)
  // Newer deploy won — do not clobber with an older success.
  if (
    row?.lastOperationId &&
    row.lastOperationId !== input.operationId
  ) {
    return
  }
  await transitionService(input.serviceId, "running", {
    publicUrl: input.publicUrl ?? undefined,
    image: input.image ?? undefined,
    containerId: input.containerId ?? undefined,
    errorMessage: null,
    errorCode: null,
    lastOperationId: input.operationId,
  })
}

export async function markServiceDeployFailed(input: {
  serviceId: string
  operationId: string
  message: string
  code?: string
}): Promise<void> {
  const [row] = await db
    .select({ lastOperationId: services.lastOperationId })
    .from(services)
    .where(eq(services.id, input.serviceId))
    .limit(1)
  // A newer deploy owns the service — ignore stale failure.
  if (
    row?.lastOperationId &&
    row.lastOperationId !== input.operationId
  ) {
    return
  }
  await transitionServiceBestEffort(input.serviceId, "error", {
    errorMessage: input.message,
    errorCode: input.code ?? "deploy_failed",
    lastOperationId: input.operationId,
  })
}

export async function markServiceProvisionSucceeded(input: {
  serviceId: string
  operationId: string
  credentialsEncrypted: string
}): Promise<void> {
  await transitionService(input.serviceId, "running", {
    credentialsEncrypted: input.credentialsEncrypted,
    errorMessage: null,
    errorCode: null,
    lastOperationId: input.operationId,
  })
}

export async function markServiceProvisionFailed(input: {
  serviceId: string
  operationId: string
  message: string
}): Promise<void> {
  await transitionServiceBestEffort(input.serviceId, "error", {
    errorMessage: input.message,
    errorCode: "provision_failed",
    lastOperationId: input.operationId,
  })
}

export async function markServiceProvisioning(serviceId: string): Promise<void> {
  await transitionService(serviceId, "provisioning", {
    errorMessage: null,
    errorCode: null,
  })
}
