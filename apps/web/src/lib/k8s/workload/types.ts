import type { ResourceCredentials } from "@hostrig/shared"

export type WorkloadDestroyContext = {
  kubeconfigYaml: string
  projectSlug: string
  serviceName: string
  serviceId: string
}

export type WorkloadProvisionContext = {
  kubeconfigYaml: string
  projectSlug: string
  serviceName: string
  serviceId: string
  projectId: string
}

export type WorkloadDeployContext = {
  kubeconfigYaml: string
  projectSlug: string
  serviceId: string
  serviceName: string
  image: string
  containerPort: number
  env: Record<string, string>
  hostname: string | null
  replicas?: number
  imagePullSecrets?: string[]
}

export type WorkloadDeployResult = {
  namespace: string
  deploymentName: string
  publicHost: string | null
}

export type WorkloadScaleContext = {
  kubeconfigYaml: string
  projectSlug: string
  serviceName: string
  replicas: number
}

/**
 * Cluster workload lifecycle for a set of service types (web, postgres, …).
 * Destroy/provision/deploy/stop paths resolve a driver instead of switching on type.
 */
export interface ServiceWorkloadDriver {
  readonly types: readonly string[]
  destroy(ctx: WorkloadDestroyContext): Promise<void>
  provision?(ctx: WorkloadProvisionContext): Promise<ResourceCredentials | null>
  deploy?(ctx: WorkloadDeployContext): Promise<WorkloadDeployResult>
  stop?(ctx: WorkloadScaleContext): Promise<void>
  scale?(ctx: WorkloadScaleContext): Promise<void>
}
