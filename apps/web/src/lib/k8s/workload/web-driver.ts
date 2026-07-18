import {
  deleteWebService,
  deployWebService,
  scaleWebService,
  waitForDeploymentReady,
} from "../deploy"
import type {
  ServiceWorkloadDriver,
  WorkloadDeployContext,
  WorkloadDeployResult,
  WorkloadDestroyContext,
  WorkloadScaleContext,
} from "./types"

export class WebWorkloadDriver implements ServiceWorkloadDriver {
  readonly types = ["web", "worker"] as const

  async destroy(ctx: WorkloadDestroyContext): Promise<void> {
    await deleteWebService({
      kubeconfigYaml: ctx.kubeconfigYaml,
      projectSlug: ctx.projectSlug,
      serviceName: ctx.serviceName,
    })
  }

  async deploy(ctx: WorkloadDeployContext): Promise<WorkloadDeployResult> {
    const result = await deployWebService({
      kubeconfigYaml: ctx.kubeconfigYaml,
      projectSlug: ctx.projectSlug,
      serviceId: ctx.serviceId,
      serviceName: ctx.serviceName,
      image: ctx.image,
      containerPort: ctx.containerPort,
      env: ctx.env,
      hostname: ctx.hostname,
      replicas: ctx.replicas,
      imagePullSecrets: ctx.imagePullSecrets,
    })
    const ready = await waitForDeploymentReady({
      kubeconfigYaml: ctx.kubeconfigYaml,
      projectSlug: ctx.projectSlug,
      serviceName: ctx.serviceName,
      timeoutMs: 120_000,
    })
    if (!ready.ready) {
      throw new Error(
        `Workload did not become ready:\n${ready.message}\n\nOn the cluster: kubectl -n ${result.namespace} describe pod -l app.kubernetes.io/name=${ctx.serviceName}`,
      )
    }
    return result
  }

  async stop(ctx: WorkloadScaleContext): Promise<void> {
    await scaleWebService({
      kubeconfigYaml: ctx.kubeconfigYaml,
      projectSlug: ctx.projectSlug,
      serviceName: ctx.serviceName,
      replicas: 0,
    })
  }

  async scale(ctx: WorkloadScaleContext): Promise<void> {
    await scaleWebService({
      kubeconfigYaml: ctx.kubeconfigYaml,
      projectSlug: ctx.projectSlug,
      serviceName: ctx.serviceName,
      replicas: ctx.replicas,
    })
  }
}
