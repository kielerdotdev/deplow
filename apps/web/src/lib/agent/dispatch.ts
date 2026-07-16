import type { AgentDeployJobPayload, AgentJobType } from "@deplow/shared"
import {
  containerRuntimeEnv,
  injectDeployEnv,
  injectDeployEnvFromBindings,
} from "@deplow/runtime"

import { resolveCloneAuthForProject } from "@/lib/git-auth"
import {
  getProjectCredentials,
  getProjectEnvSecrets,
  getServiceDeployEnv,
  platformConfig,
} from "@/lib/services"

import { enqueueNodeJob } from "./jobs"
import { isAgentOnline } from "./tokens"

export { isAgentOnline }

type ServiceRow = {
  id: string
  name: string
  slug: string
  type: string
  containerPort: number
  gitProvider: string | null
  gitRepoUrl: string | null
  gitBranch: string | null
  gitAuthMethod: string | null
  gitInstallationId: string | null
  gitAccessTokenEncrypted: string | null
  buildStrategyOverride: string | null
  dockerfilePath: string | null
  rootDirectory: string | null
  buildCommand: string | null
  startCommand: string | null
  healthCheckPath: string | null
  envJson: string | null
}

type ProjectRow = {
  id: string
  name: string
  slug: string
  ownerId: string
}

export async function enqueueAgentDeploy(input: {
  nodeId: string
  operationId: string
  deploymentId: string
  service: ServiceRow
  project: ProjectRow
  fromGit?: boolean
  image?: string
  sourcePath?: string
  options?: {
    env?: Record<string, string>
    publishPort?: number
    containerPort?: number
    command?: string[]
    entrypoint?: string[]
    readOnlyRootfs?: boolean
  }
}): Promise<string> {
  const { service, project } = input
  const containerPort =
    input.options?.containerPort ?? service.containerPort ?? 80

  const serviceEnv = service.envJson
    ? (JSON.parse(service.envJson) as Record<string, string>)
    : {}
  const projectEnv = await getProjectEnvSecrets(project.id)
  const bindingEnv = await getServiceDeployEnv(service.id)
  const credentials = bindingEnv
    ? null
    : await getProjectCredentials(project.id)

  const baseExtra = {
    ...projectEnv,
    ...serviceEnv,
    ...(input.options?.env ?? {}),
    SERVICE_NAME: service.name,
    PROJECT_NAME: project.name,
    ...(service.type === "web"
      ? { PORT: String(containerPort), HOST: "0.0.0.0" }
      : {}),
  }

  const env = bindingEnv
    ? injectDeployEnvFromBindings(bindingEnv, platformConfig, baseExtra)
    : credentials
      ? injectDeployEnv(credentials, platformConfig, baseExtra)
      : containerRuntimeEnv(baseExtra)

  let gitAuth: AgentDeployJobPayload["gitAuth"]
  if (input.fromGit && service.gitRepoUrl) {
    const auth = await resolveCloneAuthForProject({
      gitProvider: service.gitProvider,
      gitRepoUrl: service.gitRepoUrl,
      gitAuthMethod: service.gitAuthMethod,
      gitInstallationId: service.gitInstallationId,
      gitAccessTokenEncrypted: service.gitAccessTokenEncrypted,
      ownerId: project.ownerId,
    })
    if (auth?.token) {
      gitAuth = {
        token: auth.token,
        username: auth.username,
        provider: service.gitProvider ?? undefined,
      }
    }
  }

  const payload: AgentDeployJobPayload = {
    operationId: input.operationId,
    deploymentId: input.deploymentId,
    serviceId: service.id,
    projectId: project.id,
    nodeId: input.nodeId,
    serviceName: service.slug,
    serviceType: service.type === "worker" ? "worker" : "web",
    containerPort,
    fromGit: input.fromGit,
    image: input.image,
    sourcePath: input.sourcePath,
    gitRepoUrl: service.gitRepoUrl ?? undefined,
    gitBranch: service.gitBranch || "main",
    gitAuth,
    buildStrategyOverride:
      (service.buildStrategyOverride as
        | "auto"
        | "railpack"
        | "dockerfile"
        | null) || undefined,
    dockerfilePath: service.dockerfilePath,
    rootDirectory: service.rootDirectory,
    buildCommand: service.buildCommand,
    startCommand: service.startCommand,
    healthCheckPath: service.healthCheckPath,
    env,
    options: input.options,
    projectSlug: project.slug,
  }

  return enqueueNodeJob({
    nodeId: input.nodeId,
    operationId: input.operationId,
    type: "deploy",
    payload,
  })
}

export async function enqueueAgentJob(input: {
  nodeId: string
  operationId?: string | null
  type: AgentJobType
  payload: unknown
}): Promise<string> {
  return enqueueNodeJob(input)
}
