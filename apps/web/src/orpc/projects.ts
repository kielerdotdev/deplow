import { ORPCError } from "@orpc/server"
import * as z from "zod"

import { eq } from "@deplow/db"
import { createProjectInputSchema } from "@deplow/shared"

import {
  BackupScheduler,
  assertProductionSlug,
  SecretsService,
} from "@/lib/core"
import {
  backupScheduler,
  backupService,
  db,
  dockerNodeExecutor,
  ensureLocalNodeId,
  getProjectCredentials,
  projects,
  proxyService,
  resourceLinks,
  resourceLinkService,
  scheduleProjectBackups,
  services,
} from "@/lib/services"

import { authedProcedure } from "./middleware"

function serviceGit(row: typeof services.$inferSelect) {
  return {
    connected: Boolean(row.gitRepoUrl && row.gitWebhookSecretEncrypted),
    provider: (row.gitProvider as "github" | "gitlab" | null) ?? null,
    repoUrl: row.gitRepoUrl,
    repoFullName: row.gitRepoFullName,
    branch: row.gitBranch ?? "main",
    webhookUrl: row.gitRepoUrl ? `/api/webhooks/git/${row.id}` : null,
    authMethod: row.gitAuthMethod,
    webhookManaged: Boolean(row.gitRemoteWebhookId),
    lastDeliveryAt: row.gitLastDeliveryAt?.toISOString() ?? null,
    lastDeliveryStatus: row.gitLastDeliveryStatus,
    lastDeliveryError: row.gitLastDeliveryError,
    connectedAt: row.gitConnectedAt?.toISOString() ?? null,
  }
}

function serviceSummary(row: typeof services.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    slug: row.slug,
    type: row.type,
    isPrimary: row.isPrimary,
    containerPort: row.containerPort,
    status: row.status,
    publicUrl: row.publicUrl,
    image: row.image,
    errorMessage: row.errorMessage,
    env: row.envJson ? (JSON.parse(row.envJson) as Record<string, string>) : {},
    git: serviceGit(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function linkSummary(row: typeof resourceLinks.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    kind: row.kind,
    source: row.source,
    status: row.status,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function loadOwnedProject(id: string, ownerId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, id))
  if (!project || project.ownerId !== ownerId) {
    throw new ORPCError("NOT_FOUND", { message: "Project not found" })
  }
  return project
}

async function detail(row: typeof projects.$inferSelect) {
  const [serviceRows, links] = await Promise.all([
    db.select().from(services).where(eq(services.projectId, row.id)),
    db.select().from(resourceLinks).where(eq(resourceLinks.projectId, row.id)),
  ])
  const primary = serviceRows.find((service) => service.isPrimary)
  const credentials = resourceLinkService.assemble(links)
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    nodeId: row.nodeId,
    publicUrl:
      primary?.publicUrl ??
      (primary
        ? proxyService.publicUrlForService(row.slug, primary.name, true)
        : null),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    errorMessage: row.errorMessage,
    backupIntervalMs: row.backupIntervalMs,
    lastBackupAt: row.lastBackupAt?.toISOString() ?? null,
    hasCredentials: Boolean(credentials),
    secretsYaml: credentials
      ? new SecretsService().generateSecretsYaml(credentials)
      : null,
    services: serviceRows.map(serviceSummary),
    resourceLinks: links.map(linkSummary),
  }
}

export const list = authedProcedure.handler(async ({ context }) => {
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.ownerId, context.session!.user.id))
  return Promise.all(rows.map(detail))
})

export const get = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) =>
    detail(await loadOwnedProject(input.id, context.session!.user.id)),
  )

export const create = authedProcedure
  .input(createProjectInputSchema)
  .handler(async ({ context, input }) => {
    try {
      assertProductionSlug(input.name)
    } catch (error) {
      throw new ORPCError("BAD_REQUEST", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
    const existing = await db
      .select()
      .from(projects)
      .where(eq(projects.name, input.name))
    if (existing.length) {
      throw new ORPCError("CONFLICT", {
        message: "Project name is already taken",
      })
    }

    const id = crypto.randomUUID()
    const nodeId = await ensureLocalNodeId()
    const interval = BackupScheduler.defaultIntervalMs()
    await db.insert(projects).values({
      id,
      name: input.name,
      slug: input.name,
      ownerId: context.session!.user.id,
      nodeId,
      backupIntervalMs: interval,
      status: "provisioning",
    })

    try {
      for (const kind of ["postgres", "redis", "s3"] as const) {
        const linkId = crypto.randomUUID()
        await db.insert(resourceLinks).values({
          id: linkId,
          projectId: id,
          kind,
          source: "shared-instance",
          status: "provisioning",
        })
        try {
          const credentialsEncrypted = await resourceLinkService.provision(
            kind,
            input.name,
          )
          await db
            .update(resourceLinks)
            .set({ status: "ready", credentialsEncrypted })
            .where(eq(resourceLinks.id, linkId))
        } catch (error) {
          await db
            .update(resourceLinks)
            .set({
              status: "error",
              errorMessage:
                error instanceof Error ? error.message : String(error),
            })
            .where(eq(resourceLinks.id, linkId))
          throw error
        }
      }

      await db.insert(services).values({
        id: crypto.randomUUID(),
        projectId: id,
        name: "app",
        slug: `${input.name}-app`,
        type: "web",
        isPrimary: true,
        containerPort: 80,
        status: "ready",
      })
      await db
        .update(projects)
        .set({ status: "ready", errorMessage: null })
        .where(eq(projects.id, id))
      scheduleProjectBackups(id, interval)
      return detail(await loadOwnedProject(id, context.session!.user.id))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await db
        .update(projects)
        .set({ status: "error", errorMessage: message })
        .where(eq(projects.id, id))
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message })
    }
  })

export const destroy = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const project = await loadOwnedProject(input.id, context.session!.user.id)
    await db
      .update(projects)
      .set({ status: "destroying" })
      .where(eq(projects.id, project.id))
    backupScheduler.unschedule(project.id)
    const [serviceRows, links] = await Promise.all([
      db.select().from(services).where(eq(services.projectId, project.id)),
      db
        .select()
        .from(resourceLinks)
        .where(eq(resourceLinks.projectId, project.id)),
    ])
    await Promise.all(
      serviceRows.map((service) =>
        proxyService.removeServiceRoute(service.id).catch(() => undefined),
      ),
    )
    await dockerNodeExecutor
      .removeProjectContainers(project.id)
      .catch(() => undefined)
    for (const link of links) {
      await resourceLinkService
        .destroy(
          link.kind as "postgres" | "redis" | "s3",
          project.slug,
          link.credentialsEncrypted,
        )
        .catch(() => undefined)
    }
    await db.delete(projects).where(eq(projects.id, project.id))
    return { ok: true as const }
  })

export const secrets = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    await loadOwnedProject(input.id, context.session!.user.id)
    const credentials = await getProjectCredentials(input.id)
    return {
      secretsYaml: credentials
        ? new SecretsService().generateSecretsYaml(credentials)
        : "",
    }
  })

export const backup = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    await loadOwnedProject(input.id, context.session!.user.id)
    const credentials = await getProjectCredentials(input.id)
    if (!credentials) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Resource links are not ready",
      })
    }
    return backupService.run(input.id, credentials)
  })

export const listBackups = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    await loadOwnedProject(input.id, context.session!.user.id)
    return backupService.list(input.id)
  })

export const backupSchedule = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const project = await loadOwnedProject(input.id, context.session!.user.id)
    return {
      intervalMs: project.backupIntervalMs,
      scheduled: backupScheduler.isScheduled(project.id),
      lastBackupAt: project.lastBackupAt?.toISOString() ?? null,
    }
  })
