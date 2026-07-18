import type { DatabaseCredentials, ResourceCredentials } from "@hostrig/shared"

import type { BackupStore } from "./backup.service"
import type { DataServiceDriver } from "./data-services"
import type { PlatformConfig } from "./platform-config"

export type PitrWindow = {
  enabled: boolean
  stanza: string
  windowStart: string | null
  windowEnd: string | null
  lastBaseBackupAt: string | null
  message?: string
}

/**
 * Per-project Postgres PITR via the Postgres driver's PitrCapable.
 * Restores the whole dedicated instance (not a single DB from a shared cluster).
 */
export class PitrService {
  constructor(
    _config: PlatformConfig,
    private readonly store: BackupStore,
  ) {}

  static enabled(): boolean {
    return process.env.HOSTRIG_PITR_ENABLED === "1"
  }

  async status(
    driver: DataServiceDriver,
    ctx: {
      projectId: string
      projectSlug: string
      resourceLinkId: string
      credentials: ResourceCredentials
    },
  ): Promise<PitrWindow> {
    if (!driver.pitr) {
      return {
        enabled: false,
        stanza: ctx.projectId,
        windowStart: null,
        windowEnd: null,
        lastBaseBackupAt: null,
        message: "This resource does not support PITR",
      }
    }
    return driver.pitr.status(ctx)
  }

  async restoreProjectToTime(
    projectId: string,
    projectSlug: string,
    resourceLinkId: string,
    credentials: DatabaseCredentials,
    driver: DataServiceDriver,
    targetAt: Date,
  ): Promise<{ id: string; status: string }> {
    if (!driver.pitr) {
      throw new Error("This resource does not support PITR")
    }
    if (!PitrService.enabled()) {
      throw new Error("PITR is not enabled")
    }

    const targetIso = targetAt.toISOString()
    const job = await this.store.createRunning(
      projectId,
      `projects/${projectId}/pitr-${Date.now()}`,
      "pitr_restore",
      targetIso,
      resourceLinkId,
    )

    try {
      await driver.pitr.restoreToTime(
        {
          projectId,
          projectSlug,
          resourceLinkId,
          credentials,
        },
        targetAt,
      )
      await this.store.complete(job.id, 0)
      return { id: job.id, status: "completed" }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.store.fail(job.id, message)
      throw error
    }
  }
}
