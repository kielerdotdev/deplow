import { eq, db, projects, resourceLinks, services } from "@deplow/db"

import { backupScheduler, resourceLinkService } from "@/lib/services"
import { serviceLifecycle } from "@/lib/service-lifecycle"

export type ProjectDestroyContext = {
  projectId: string
  projectSlug: string
  nodeId: string | null
  ownerId?: string | null
}

export interface ProjectDestroyPhase {
  readonly id: string
  run(ctx: ProjectDestroyContext): Promise<void>
}

export class UnscheduleBackupPhase implements ProjectDestroyPhase {
  readonly id = "unschedule-backup"
  async run(ctx: ProjectDestroyContext): Promise<void> {
    backupScheduler.unschedule(ctx.projectId)
  }
}

export class DestroyServicesPhase implements ProjectDestroyPhase {
  readonly id = "destroy-services"
  async run(ctx: ProjectDestroyContext): Promise<void> {
    const rows = await db
      .select()
      .from(services)
      .where(eq(services.projectId, ctx.projectId))
    const failures: string[] = []
    for (const service of rows) {
      try {
        await serviceLifecycle.destroy({
          serviceId: service.id,
          force: true,
          userId: ctx.ownerId ?? undefined,
        })
      } catch (e) {
        failures.push(
          `${service.name}: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `Failed to destroy ${failures.length} service(s): ${failures.join("; ")}`,
      )
    }
  }
}

export class DestroyResourceLinksPhase implements ProjectDestroyPhase {
  readonly id = "destroy-resource-links"
  async run(ctx: ProjectDestroyContext): Promise<void> {
    const links = await db
      .select()
      .from(resourceLinks)
      .where(eq(resourceLinks.projectId, ctx.projectId))
    for (const link of links) {
      await resourceLinkService
        .destroy(
          link.kind as "postgres" | "redis" | "s3",
          ctx.projectSlug,
          link.credentialsEncrypted,
          { projectId: ctx.projectId, resourceLinkId: link.id },
        )
        .catch(() => undefined)
    }
  }
}

export class DeleteProjectRowPhase implements ProjectDestroyPhase {
  readonly id = "delete-project-row"
  async run(ctx: ProjectDestroyContext): Promise<void> {
    await db.delete(projects).where(eq(projects.id, ctx.projectId))
  }
}

let phases: ProjectDestroyPhase[] | null = null

export function projectDestroyPhases(): ProjectDestroyPhase[] {
  if (!phases) {
    phases = [
      new UnscheduleBackupPhase(),
      new DestroyServicesPhase(),
      new DestroyResourceLinksPhase(),
      new DeleteProjectRowPhase(),
    ]
  }
  return phases
}

export async function runProjectDestroy(
  ctx: ProjectDestroyContext,
): Promise<void> {
  const [project] = await db
    .select({ ownerId: projects.ownerId })
    .from(projects)
    .where(eq(projects.id, ctx.projectId))
    .limit(1)

  await db
    .update(projects)
    .set({ status: "destroying" })
    .where(eq(projects.id, ctx.projectId))

  const full: ProjectDestroyContext = {
    ...ctx,
    ownerId: ctx.ownerId ?? project?.ownerId ?? null,
  }

  try {
    for (const phase of projectDestroyPhases()) {
      await phase.run(full)
    }
  } catch (e) {
    // Leave project in destroying so the operator can retry; do not cascade-delete.
    await db
      .update(projects)
      .set({
        status: "error",
        errorMessage: e instanceof Error ? e.message : String(e),
      })
      .where(eq(projects.id, ctx.projectId))
      .catch(() => undefined)
    throw e
  }
}
