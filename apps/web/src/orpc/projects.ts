import { ORPCError } from "@orpc/server"
import * as z from "zod"

import { createProjectInputSchema } from "@deplow/shared"
import { eq } from "@deplow/db"

import { BackupScheduler } from "@/lib/core"
import {
  backupScheduler,
  backupService,
  db,
  decryptProjectCredentials,
  dockerNodeExecutor,
  projects,
  provisioningService,
  scheduleProjectBackups,
} from "@/lib/services"

import { authedProcedure } from "./middleware"

function toSummary(row: typeof projects.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    errorMessage: row.errorMessage,
    backupIntervalMs: row.backupIntervalMs,
    lastBackupAt: row.lastBackupAt ? row.lastBackupAt.toISOString() : null,
  }
}

export const list = authedProcedure.handler(async ({ context }) => {
  const ownerId = context.session!.user.id
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.ownerId, ownerId))
  return rows
    .map(toSummary)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
})

export const get = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const ownerId = context.session!.user.id
    const [row] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, input.id))
    if (!row || row.ownerId !== ownerId) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" })
    }
    return {
      ...toSummary(row),
      secretsYaml: row.secretsYaml,
      hasCredentials: Boolean(row.credentialsEncrypted),
      backupIntervalMs: row.backupIntervalMs,
      lastBackupAt: row.lastBackupAt ? row.lastBackupAt.toISOString() : null,
    }
  })

export const create = authedProcedure
  .input(createProjectInputSchema)
  .handler(async ({ context, input }) => {
    const ownerId = context.session!.user.id
    const existing = await db
      .select()
      .from(projects)
      .where(eq(projects.name, input.name))
    if (existing.length > 0) {
      throw new ORPCError("CONFLICT", {
        message: `Project name "${input.name}" is already taken`,
      })
    }

    const projectId = crypto.randomUUID()
    const backupIntervalMs = BackupScheduler.defaultIntervalMs()
    await db.insert(projects).values({
      id: projectId,
      name: input.name,
      slug: input.name,
      ownerId,
      status: "provisioning",
      backupIntervalMs,
    })

    try {
      const result = await provisioningService.createProject({
        ...input,
        projectId,
      })
      await db
        .update(projects)
        .set({
          status: "ready",
          credentialsEncrypted: result.credentialsEncrypted,
          secretsYaml: result.secrets,
          errorMessage: null,
          backupIntervalMs,
        })
        .where(eq(projects.id, projectId))

      scheduleProjectBackups(projectId, backupIntervalMs)

      const [row] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
      return {
        ...toSummary(row!),
        secretsYaml: row!.secretsYaml,
        hasCredentials: true,
        spawnedServerId: result.spawnedServerId,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await db
        .update(projects)
        .set({ status: "error", errorMessage: message })
        .where(eq(projects.id, projectId))
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message })
    }
  })

export const destroy = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const ownerId = context.session!.user.id
    const [row] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, input.id))
    if (!row || row.ownerId !== ownerId) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" })
    }

    await db
      .update(projects)
      .set({ status: "destroying" })
      .where(eq(projects.id, input.id))

    backupScheduler.unschedule(row.id)
    await dockerNodeExecutor
      .removeProjectContainers(row.id)
      .catch(() => undefined)

    const credentials = decryptProjectCredentials(row.credentialsEncrypted)
    await provisioningService.destroyProject({
      projectId: row.id,
      slug: row.slug,
      credentials,
    })
    await db.delete(projects).where(eq(projects.id, input.id))
    return { ok: true as const }
  })

export const secrets = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const ownerId = context.session!.user.id
    const [row] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, input.id))
    if (!row || row.ownerId !== ownerId) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" })
    }
    return { secretsYaml: row.secretsYaml ?? "" }
  })

export const backup = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const ownerId = context.session!.user.id
    const [row] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, input.id))
    if (!row || row.ownerId !== ownerId) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" })
    }
    const credentials = decryptProjectCredentials(row.credentialsEncrypted)
    if (!credentials) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Project has no credentials to back up",
      })
    }
    const record = await backupService.run(row.id, credentials)
    return record
  })

export const backupSchedule = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const ownerId = context.session!.user.id
    const [row] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, input.id))
    if (!row || row.ownerId !== ownerId) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" })
    }
    return {
      intervalMs: row.backupIntervalMs,
      scheduled: backupScheduler.isScheduled(row.id),
      lastBackupAt: row.lastBackupAt ? row.lastBackupAt.toISOString() : null,
    }
  })

export const listBackups = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const ownerId = context.session!.user.id
    const [row] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, input.id))
    if (!row || row.ownerId !== ownerId) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" })
    }
    return backupService.list(row.id)
  })
