import { eq, db, services } from "@hostrig/db"

import { decryptString, encryptString } from "@/lib/core"
import {
  deleteServiceWebhook,
  registerServiceWebhook,
} from "@/lib/register-service-webhook"
import { gitService, platformConfig } from "@/lib/services"

import { ServiceLifecycleError } from "./deploy"

function encodeWatchPaths(
  paths: string[] | null | undefined,
): string | null | undefined {
  if (paths === undefined) return undefined
  if (paths === null || paths.length === 0) return null
  return JSON.stringify(paths)
}

export async function connectServiceGit(input: {
  userId: string
  serviceId: string
  provider: "github" | "gitlab"
  repoUrl: string
  branch: string
  repoFullName?: string
  authMethod?: string | null
  installationId?: string | null
  accessToken?: string
  webhookSecret?: string
  gitWatchPaths?: string[] | null
  autoWebhook?: boolean
}): Promise<{
  connected: true
  webhookUrl: string
  webhookSecret: string | null
  webhookManaged: boolean
  webhookWarning: string | null | undefined
}> {
  const [service] = await db
    .select()
    .from(services)
    .where(eq(services.id, input.serviceId))
    .limit(1)
  if (!service) {
    throw new ServiceLifecycleError("Service not found", "NOT_FOUND")
  }

  const secret =
    input.webhookSecret?.trim() || gitService.generateWebhookSecret()
  await db
    .update(services)
    .set({
      gitProvider: input.provider,
      gitRepoUrl: input.repoUrl,
      gitBranch: input.branch,
      gitRepoFullName: input.repoFullName ?? null,
      gitAuthMethod: input.authMethod ?? (input.accessToken ? "pat" : null),
      gitInstallationId: input.installationId ?? null,
      gitAccessTokenEncrypted: input.accessToken
        ? encryptString(input.accessToken, platformConfig.secretsEncryptionKey)
        : null,
      gitWebhookSecretEncrypted: encryptString(
        secret,
        platformConfig.secretsEncryptionKey,
      ),
      gitWatchPaths:
        input.gitWatchPaths === undefined
          ? undefined
          : encodeWatchPaths(input.gitWatchPaths),
      gitConnectedAt: new Date(),
      gitRemoteWebhookId: null,
    })
    .where(eq(services.id, service.id))

  const webhook = await registerServiceWebhook({
    userId: input.userId,
    serviceId: service.id,
    provider: input.provider,
    repoUrl: input.repoUrl,
    repoFullName: input.repoFullName,
    installationId: input.installationId ?? undefined,
    accessToken: input.accessToken,
    secret,
    autoWebhook: input.autoWebhook,
  })
  if (webhook.remoteWebhookId) {
    await db
      .update(services)
      .set({ gitRemoteWebhookId: webhook.remoteWebhookId })
      .where(eq(services.id, service.id))
  }

  return {
    connected: true as const,
    webhookUrl: webhook.webhookUrl,
    webhookSecret: webhook.webhookManaged ? null : secret,
    webhookManaged: webhook.webhookManaged,
    webhookWarning: webhook.warning,
  }
}

export async function disconnectServiceGit(input: {
  userId: string
  serviceId: string
}): Promise<{ ok: true }> {
  const [service] = await db
    .select()
    .from(services)
    .where(eq(services.id, input.serviceId))
    .limit(1)
  if (!service) {
    throw new ServiceLifecycleError("Service not found", "NOT_FOUND")
  }

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
  })
  await db
    .update(services)
    .set({
      gitProvider: null,
      gitRepoUrl: null,
      gitBranch: "main",
      gitWebhookSecretEncrypted: null,
      gitConnectedAt: null,
      gitLastDeliveryAt: null,
      gitLastDeliveryStatus: null,
      gitLastDeliveryError: null,
      gitAuthMethod: null,
      gitInstallationId: null,
      gitAccessTokenEncrypted: null,
      gitRemoteWebhookId: null,
      gitRepoFullName: null,
      gitWatchPaths: null,
    })
    .where(eq(services.id, service.id))
  return { ok: true as const }
}

/** Register git fields + webhook on a newly created service (createAndDeploy). */
export async function attachGitOnCreate(input: {
  userId: string
  serviceId: string
  provider: "github" | "gitlab"
  repoUrl: string
  branch: string
  repoFullName?: string | null
  authMethod?: string | null
  installationId?: string | null
  accessToken?: string
  secret: string
  autoWebhook?: boolean
  buildFields: {
    buildStrategyOverride: string | null
    dockerfilePath: string | null
    rootDirectory: string | null
    buildCommand: string | null
    startCommand: string | null
    healthCheckPath: string | null
  }
}): Promise<{
  remoteWebhookId: string | null
  webhookUrl: string
  webhookManaged: boolean
  warning: string | null | undefined
}> {
  await db
    .update(services)
    .set({
      gitProvider: input.provider,
      gitRepoUrl: input.repoUrl,
      gitBranch: input.branch,
      gitRepoFullName: input.repoFullName ?? null,
      gitAuthMethod: input.authMethod ?? (input.accessToken ? "pat" : null),
      gitInstallationId: input.installationId ?? null,
      gitAccessTokenEncrypted: input.accessToken
        ? encryptString(input.accessToken, platformConfig.secretsEncryptionKey)
        : null,
      gitWebhookSecretEncrypted: encryptString(
        input.secret,
        platformConfig.secretsEncryptionKey,
      ),
      gitConnectedAt: new Date(),
      buildStrategyOverride: input.buildFields.buildStrategyOverride,
      dockerfilePath: input.buildFields.dockerfilePath,
      rootDirectory: input.buildFields.rootDirectory,
      buildCommand: input.buildFields.buildCommand,
      startCommand: input.buildFields.startCommand,
      healthCheckPath: input.buildFields.healthCheckPath,
    })
    .where(eq(services.id, input.serviceId))

  const webhook = await registerServiceWebhook({
    userId: input.userId,
    serviceId: input.serviceId,
    provider: input.provider,
    repoUrl: input.repoUrl,
    repoFullName: input.repoFullName ?? undefined,
    installationId: input.installationId ?? undefined,
    accessToken: input.accessToken,
    secret: input.secret,
    autoWebhook: input.autoWebhook,
  })
  if (webhook.remoteWebhookId) {
    await db
      .update(services)
      .set({ gitRemoteWebhookId: webhook.remoteWebhookId })
      .where(eq(services.id, input.serviceId))
  }
  return {
    remoteWebhookId: webhook.remoteWebhookId,
    webhookUrl: webhook.webhookUrl,
    webhookManaged: webhook.webhookManaged,
    warning: webhook.warning,
  }
}
