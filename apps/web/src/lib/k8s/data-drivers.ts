/**
 * DataServiceDriver implementations that provision/destroy on the connected k3s cluster.
 * Backup/principals delegate to the Docker-era drivers (credentials-based).
 */

import type { ResourceCredentials, ResourceKind } from "@deplow/shared"

import {
  PostgresContainerDriver,
  RedisContainerDriver,
} from "@/lib/core/data-services"
import type {
  DataServiceDriver,
  DestroyContext,
  ProvisionContext,
  ResourceCapabilities,
} from "@/lib/core/data-services"
import type { PlatformConfig } from "@/lib/core/platform-config"

import { requireConnectedKubeconfig } from "./cluster-store"
import {
  destroyDataOnK8s,
  provisionPostgresOnK8s,
  provisionRedisOnK8s,
} from "./data"

export class K8sPostgresDriver implements DataServiceDriver {
  readonly kind = "postgres" as const
  readonly source = "dedicated-container" as const
  readonly defaultEnvKey = "DATABASE_URL"
  private readonly legacy: PostgresContainerDriver

  constructor(config: PlatformConfig) {
    this.legacy = new PostgresContainerDriver(config)
  }

  get capabilities(): ResourceCapabilities {
    return this.legacy.capabilities
  }

  get backup() {
    return this.legacy.backup
  }

  get pitr() {
    return this.legacy.pitr
  }

  get principals() {
    return this.legacy.principals
  }

  async provision(ctx: ProvisionContext): Promise<ResourceCredentials> {
    const kubeconfigYaml = await requireConnectedKubeconfig()
    return provisionPostgresOnK8s({
      kubeconfigYaml,
      projectSlug: ctx.projectSlug,
      serviceName: ctx.serviceName ?? "postgres",
    })
  }

  async destroy(ctx: DestroyContext): Promise<void> {
    try {
      const kubeconfigYaml = await requireConnectedKubeconfig()
      await destroyDataOnK8s({
        kubeconfigYaml,
        projectSlug: ctx.projectSlug,
        serviceName: ctx.serviceName ?? "postgres",
        kind: "postgres",
      })
    } catch {
      await this.legacy.destroy(ctx)
    }
  }
}

export class K8sRedisDriver implements DataServiceDriver {
  readonly kind = "redis" as const
  readonly source = "dedicated-container" as const
  readonly defaultEnvKey = "REDIS_URL"
  private readonly legacy: RedisContainerDriver

  constructor(config: PlatformConfig) {
    this.legacy = new RedisContainerDriver(config)
  }

  get capabilities(): ResourceCapabilities {
    return this.legacy.capabilities
  }

  get backup() {
    return this.legacy.backup
  }

  get principals() {
    return this.legacy.principals
  }

  get exportImport() {
    return this.legacy.exportImport
  }

  async provision(ctx: ProvisionContext): Promise<ResourceCredentials> {
    const kubeconfigYaml = await requireConnectedKubeconfig()
    return provisionRedisOnK8s({
      kubeconfigYaml,
      projectSlug: ctx.projectSlug,
      serviceName: ctx.serviceName ?? "redis",
    })
  }

  async destroy(ctx: DestroyContext): Promise<void> {
    try {
      const kubeconfigYaml = await requireConnectedKubeconfig()
      await destroyDataOnK8s({
        kubeconfigYaml,
        projectSlug: ctx.projectSlug,
        serviceName: ctx.serviceName ?? "redis",
        kind: "redis",
      })
    } catch {
      await this.legacy.destroy(ctx)
    }
  }
}

export function k8sDataDrivers(config: PlatformConfig): DataServiceDriver[] {
  return [new K8sPostgresDriver(config), new K8sRedisDriver(config)]
}

export type { ResourceKind }
