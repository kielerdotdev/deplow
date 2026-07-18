import type { ResourceKind } from "@deplow/shared"

import type { PlatformConfig } from "../platform-config"
import { PostgresContainerDriver } from "./postgres-driver"
import { RedisContainerDriver } from "./redis-driver"
import { S3SharedDriver } from "./s3-driver"
import type { DataServiceDriver, ResourceCapabilities } from "./types"

export class DataServiceRegistry {
  private readonly drivers: Map<ResourceKind, DataServiceDriver>

  constructor(config: PlatformConfig, drivers?: DataServiceDriver[]) {
    const list: DataServiceDriver[] = drivers ?? [
      new PostgresContainerDriver(config),
      new RedisContainerDriver(config),
      new S3SharedDriver(config),
    ]
    this.drivers = new Map(list.map((d) => [d.kind, d]))
  }

  get(kind: ResourceKind): DataServiceDriver {
    const driver = this.drivers.get(kind)
    if (!driver) {
      throw new Error(`No data service driver for kind: ${kind}`)
    }
    return driver
  }

  capabilities(kind: ResourceKind): ResourceCapabilities {
    return this.get(kind).capabilities
  }

  all(): DataServiceDriver[] {
    return [...this.drivers.values()]
  }

  backupCapableKinds(): ResourceKind[] {
    return this.all()
      .filter((d) => d.capabilities.backup)
      .map((d) => d.kind)
  }
}

export type {
  BackupCapable,
  BackupResult,
  DataServiceDriver,
  DestroyContext,
  ExportImportCapable,
  PitrCapable,
  PrincipalsCapable,
  ProvisionContext,
  ResourceCapabilities,
} from "./types"
