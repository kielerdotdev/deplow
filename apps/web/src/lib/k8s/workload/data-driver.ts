import type { ResourceCredentials } from "@hostrig/shared"

import {
  destroyDataOnK8s,
  provisionPostgresOnK8s,
  provisionRedisOnK8s,
} from "../data"
import type {
  ServiceWorkloadDriver,
  WorkloadDestroyContext,
  WorkloadProvisionContext,
} from "./types"

export class PostgresWorkloadDriver implements ServiceWorkloadDriver {
  readonly types = ["postgres"] as const

  async destroy(ctx: WorkloadDestroyContext): Promise<void> {
    await destroyDataOnK8s({
      kubeconfigYaml: ctx.kubeconfigYaml,
      projectSlug: ctx.projectSlug,
      serviceName: ctx.serviceName,
      kind: "postgres",
    })
  }

  async provision(
    ctx: WorkloadProvisionContext,
  ): Promise<ResourceCredentials | null> {
    return provisionPostgresOnK8s({
      kubeconfigYaml: ctx.kubeconfigYaml,
      projectSlug: ctx.projectSlug,
      serviceName: ctx.serviceName,
    })
  }
}

export class RedisWorkloadDriver implements ServiceWorkloadDriver {
  readonly types = ["redis"] as const

  async destroy(ctx: WorkloadDestroyContext): Promise<void> {
    await destroyDataOnK8s({
      kubeconfigYaml: ctx.kubeconfigYaml,
      projectSlug: ctx.projectSlug,
      serviceName: ctx.serviceName,
      kind: "redis",
    })
  }

  async provision(
    ctx: WorkloadProvisionContext,
  ): Promise<ResourceCredentials | null> {
    return provisionRedisOnK8s({
      kubeconfigYaml: ctx.kubeconfigYaml,
      projectSlug: ctx.projectSlug,
      serviceName: ctx.serviceName,
    })
  }
}
