/**
 * Single env builder for all deploy paths (k8s / future agent).
 */

import { and, eq, isNull, db, observeKeys, observeProjects } from "@hostrig/db"

import {
  containerRuntimeEnv,
  injectDeployEnv,
  injectDeployEnvFromBindings,
  loadPlatformConfig,
} from "@/lib/core"
import { env as appEnv } from "@/lib/env"
import { buildObserveDeployEnv } from "@/lib/observe/store"
import {
  getProjectCredentials,
  getProjectEnvSecrets,
  getServiceDeployEnv,
} from "@/lib/services"

export async function loadObserveDeployEnv(
  projectId: string,
  service: { id: string; name: string },
): Promise<Record<string, string>> {
  if (!appEnv.observeEnabled) return {}
  const [op] = await db
    .select()
    .from(observeProjects)
    .where(eq(observeProjects.projectId, projectId))
    .limit(1)
  if (!op?.enabled) return {}
  const [key] = await db
    .select()
    .from(observeKeys)
    .where(
      and(
        eq(observeKeys.observeProjectId, op.id),
        isNull(observeKeys.revokedAt),
      ),
    )
    .limit(1)
  if (!key) return {}
  return buildObserveDeployEnv({
    sentryId: op.sentryId,
    publicKey: key.publicKey,
    serviceName: service.name,
    projectId,
    serviceId: service.id,
  })
}

export async function buildServiceDeployEnv(input: {
  serviceId: string
  projectId: string
  projectName: string
  serviceName: string
  serviceType: string
  containerPort: number
  envJson: string | null
  extraEnv?: Record<string, string>
}): Promise<Record<string, string>> {
  const platformConfig = loadPlatformConfig()
  const serviceEnv = input.envJson
    ? (JSON.parse(input.envJson) as Record<string, string>)
    : {}
  const projectEnv = await getProjectEnvSecrets(input.projectId)
  const bindingEnv = await getServiceDeployEnv(input.serviceId)
  const credentials = bindingEnv
    ? null
    : await getProjectCredentials(input.projectId)
  const observeEnv = await loadObserveDeployEnv(input.projectId, {
    id: input.serviceId,
    name: input.serviceName,
  })

  const baseExtra = {
    ...projectEnv,
    ...serviceEnv,
    ...observeEnv,
    ...(input.extraEnv ?? {}),
    SERVICE_NAME: input.serviceName,
    PROJECT_NAME: input.projectName,
    ...(input.serviceType === "web"
      ? { PORT: String(input.containerPort), HOST: "0.0.0.0" }
      : {}),
  }

  return bindingEnv
    ? injectDeployEnvFromBindings(bindingEnv, platformConfig, baseExtra)
    : credentials
      ? injectDeployEnv(credentials, platformConfig, baseExtra)
      : containerRuntimeEnv(baseExtra)
}
