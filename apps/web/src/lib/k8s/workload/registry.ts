import { PostgresWorkloadDriver, RedisWorkloadDriver } from "./data-driver"
import type { ServiceWorkloadDriver } from "./types"
import { WebWorkloadDriver } from "./web-driver"

export class ServiceWorkloadRegistry {
  private readonly byType: Map<string, ServiceWorkloadDriver>

  constructor(drivers?: ServiceWorkloadDriver[]) {
    const list = drivers ?? [
      new WebWorkloadDriver(),
      new PostgresWorkloadDriver(),
      new RedisWorkloadDriver(),
    ]
    this.byType = new Map()
    for (const d of list) {
      for (const t of d.types) {
        this.byType.set(t, d)
      }
    }
  }

  get(serviceType: string): ServiceWorkloadDriver | null {
    return this.byType.get(serviceType) ?? null
  }

  require(serviceType: string): ServiceWorkloadDriver {
    const d = this.get(serviceType)
    if (!d) {
      throw new Error(`No workload driver for service type: ${serviceType}`)
    }
    return d
  }
}

let singleton: ServiceWorkloadRegistry | null = null

export function workloadRegistry(): ServiceWorkloadRegistry {
  if (!singleton) singleton = new ServiceWorkloadRegistry()
  return singleton
}
