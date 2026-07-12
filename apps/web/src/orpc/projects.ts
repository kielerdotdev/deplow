import { ORPCError } from "@orpc/server"
import * as z from "zod"

import { and, eq } from "@deplow/db"
import { createProjectInputSchema, deriveProjectStatus, type ProjectStatus } from "@deplow/shared"
import {
  listProjectEnvSecretsInputSchema,
  saveProjectEnvSecretsInputSchema,
} from "@deplow/shared"

import {
  assertProjectAccess,
  resolveActiveOrganizationId,
} from "@/lib/access"
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
  getBackupTargets,
  getPostgresCredentials,
  getProjectCredentials,
  getProjectEnvSecrets,
  getRedisCredentials,
  getResourceTarget,
  pitrService,
  postgresProvisioner,
  projects,
  proxyService,
  redisProvisioner,
  resourceLinks,
  resourceLinkService,
  scheduleProjectBackups,
  saveProjectEnvSecrets,
  services,
} from "@/lib/services"
import { removeAllHostnames } from "@/lib/service-hostnames"

import { authedProcedure } from "./middleware"
import {
  maskProjectEnvEntries,
  recordToEntries,
} from "@/lib/core/project-secrets.service"

function throwBackupError(error: unknown): never {
  if (error instanceof ORPCError) throw error
  throw new ORPCError("INTERNAL_SERVER_ERROR", {
    message: error instanceof Error ? error.message : String(error),
  })
}

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
    watchPaths: (() => {
      if (!row.gitWatchPaths) return null
      try {
        const parsed = JSON.parse(row.gitWatchPaths) as unknown
        if (!Array.isArray(parsed)) return null
        const paths = parsed.filter(
          (p): p is string => typeof p === "string" && p.trim().length > 0,
        )
        return paths.length > 0 ? paths : null
      } catch {
        return null
      }
    })(),
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
    errorCode: row.errorCode,
    lastOperationId: row.lastOperationId,
    env: row.envJson ? (JSON.parse(row.envJson) as Record<string, string>) : {},
    rootDirectory: row.rootDirectory,
    buildStrategyOverride: row.buildStrategyOverride,
    dockerfilePath: row.dockerfilePath,
    buildCommand: row.buildCommand,
    startCommand: row.startCommand,
    healthCheckPath: row.healthCheckPath,
    git: serviceGit(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function linkSummary(row: {
  id: string
  projectId: string
  kind: string
  source: string
  status: string
  errorMessage: string | null
  createdAt: Date
  updatedAt: Date
}) {
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

async function loadAccessibleProject(id: string, session: Parameters<typeof assertProjectAccess>[1]) {
  return assertProjectAccess(id, session)
}

async function detail(row: typeof projects.$inferSelect) {
  const [serviceRows, links] = await Promise.all([
    db.select().from(services).where(eq(services.projectId, row.id)),
    db.select().from(resourceLinks).where(eq(resourceLinks.projectId, row.id)),
  ])
  const primary = serviceRows.find((service) => service.isPrimary)
  const credentials = await getProjectCredentials(row.id)

  // Prefer data services; fall back to legacy resource_links for overview tiles
  const dataAsLinks = serviceRows
    .filter((s) => s.type === "postgres" || s.type === "redis")
    .map((s) => ({
      id: s.id,
      projectId: s.projectId,
      kind: s.type,
      source: "dedicated-container" as const,
      status:
        s.status === "running"
          ? ("ready" as const)
          : s.status === "error"
            ? ("error" as const)
            : ("provisioning" as const),
      errorMessage: s.errorMessage,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }))

  const resourceLinkSummaries =
    dataAsLinks.length > 0
      ? dataAsLinks.map(linkSummary)
      : links.map(linkSummary)

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: deriveProjectStatus(
      row.status as ProjectStatus,
      serviceRows.map((s) => s.status),
    ),
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
    secretsMasked: credentials
      ? maskSecretsYaml(new SecretsService().generateSecretsYaml(credentials))
      : null,
    services: serviceRows.map(serviceSummary),
    resourceLinks: resourceLinkSummaries,
  }
}

function maskSecretsYaml(yaml: string): string {
  return yaml.replace(
    /(password|secret|key|token|DATABASE_URL|REDIS_URL)\s*[:=]\s*.+$/gim,
    (line) => {
      const idx = line.search(/[:=]/)
      if (idx < 0) return line
      return `${line.slice(0, idx + 1)} ********`
    },
  )
}

export const list = authedProcedure.handler(async ({ context }) => {
  const organizationId = await resolveActiveOrganizationId(
    context.session!,
    context.headers,
  )
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.organizationId, organizationId))
  return Promise.all(rows.map(detail))
})

export const get = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) =>
    detail(await loadAccessibleProject(input.id, context.session!)),
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
    const organizationId = await resolveActiveOrganizationId(
      context.session!,
      context.headers,
      input.organizationId,
    )
    const existing = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, organizationId),
          eq(projects.name, input.name),
        ),
      )
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
      organizationId,
      ownerId: context.session!.user.id,
      nodeId,
      backupIntervalMs: interval,
      status: "ready",
    })

    scheduleProjectBackups(id, interval)
    return detail(await loadAccessibleProject(id, context.session!))
  })

export const destroy = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const project = await assertProjectAccess(
      input.id,
      context.session!,
      "owner",
    )
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
        Promise.all([
          proxyService.removeServiceRoute(service.id).catch(() => undefined),
          removeAllHostnames(service.id).catch(() => undefined),
        ]),
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
          { projectId: project.id, resourceLinkId: link.id },
        )
        .catch(() => undefined)
    }
    for (const svc of serviceRows) {
      if (svc.type !== "postgres" && svc.type !== "redis") continue
      await resourceLinkService
        .destroy(svc.type, project.slug, svc.credentialsEncrypted, {
          projectId: project.id,
          resourceLinkId: svc.legacyResourceLinkId ?? svc.id,
        })
        .catch(() => undefined)
    }
    await db.delete(projects).where(eq(projects.id, project.id))
    return { ok: true as const }
  })

export const secrets = authedProcedure
  .input(
    z.object({
      id: z.string().min(1),
      reveal: z.boolean().optional().default(false),
    }),
  )
  .handler(async ({ context, input }) => {
    await loadAccessibleProject(input.id, context.session!)
    const credentials = await getProjectCredentials(input.id)
    const yaml = credentials
      ? new SecretsService().generateSecretsYaml(credentials)
      : ""
    if (input.reveal) {
      console.info(
        `[audit] secrets.reveal project=${input.id} user=${context.session!.user.id}`,
      )
      return { secretsYaml: yaml, masked: false }
    }
    return {
      secretsYaml: yaml.replace(
        /(password|secret|key|token|DATABASE_URL|REDIS_URL)\s*[:=]\s*.+$/gim,
        (line) => {
          const idx = line.search(/[:=]/)
          if (idx < 0) return line
          return `${line.slice(0, idx + 1)} ********`
        },
      ),
      masked: true,
    }
  })

export const envSecrets = authedProcedure
  .input(listProjectEnvSecretsInputSchema)
  .handler(async ({ context, input }) => {
    await loadAccessibleProject(input.id, context.session!)
    const record = await getProjectEnvSecrets(input.id)
    const entries = recordToEntries(record)
    if (input.reveal) {
      console.info(
        `[audit] envSecrets.reveal project=${input.id} user=${context.session!.user.id}`,
      )
      return { entries, masked: false }
    }
    return { entries: maskProjectEnvEntries(entries), masked: true }
  })

export const saveEnvSecrets = authedProcedure
  .input(saveProjectEnvSecretsInputSchema)
  .handler(async ({ context, input }) => {
    await loadAccessibleProject(input.id, context.session!)
    try {
      const record = await saveProjectEnvSecrets(input.id, input.entries)
      console.info(
        `[audit] envSecrets.save project=${input.id} user=${context.session!.user.id} count=${Object.keys(record).length}`,
      )
      return {
        entries: recordToEntries(record),
        masked: false,
      }
    } catch (error) {
      throw new ORPCError("BAD_REQUEST", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

export const backup = authedProcedure
  .input(
    z.object({
      id: z.string().min(1),
      resourceLinkId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    await loadAccessibleProject(input.id, context.session!)
    try {
      if (input.resourceLinkId) {
        const target = await getResourceTarget(input.id, input.resourceLinkId)
        if (!target) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Resource link not ready",
          })
        }
        return await backupService.run(input.id, target, { force: true })
      }
      const targets = await getBackupTargets(input.id)
      if (targets.length === 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: "No backup-capable resources are ready",
        })
      }
      const results = await backupService.runAll(input.id, targets, {
        force: true,
      })
      return results[0]
    } catch (error) {
      throwBackupError(error)
    }
  })

export const listBackups = authedProcedure
  .input(
    z.object({
      id: z.string().min(1),
      resourceLinkId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    await loadAccessibleProject(input.id, context.session!)
    return backupService.list(input.id, undefined, input.resourceLinkId)
  })

export const backupSchedule = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const project = await loadAccessibleProject(input.id, context.session!)
    return {
      intervalMs: project.backupIntervalMs,
      scheduled: backupScheduler.isScheduled(project.id),
      lastBackupAt: project.lastBackupAt?.toISOString() ?? null,
    }
  })

export const restoreBackup = authedProcedure
  .input(
    z.object({
      id: z.string().min(1),
      backupId: z.string().min(1),
      confirmName: z.string().min(1),
      resourceLinkId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const project = await loadAccessibleProject(input.id, context.session!)
    if (input.confirmName !== project.name) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Type the project name to confirm restore",
      })
    }
    let target = input.resourceLinkId
      ? await getResourceTarget(input.id, input.resourceLinkId)
      : null
    if (!target) {
      const backup = (await backupService.list(input.id, 100)).find(
        (b) => b.id === input.backupId,
      )
      if (backup?.resourceLinkId) {
        target = await getResourceTarget(input.id, backup.resourceLinkId)
      }
    }
    if (!target) {
      const targets = await getBackupTargets(input.id)
      target = targets.find((t) => t.kind === "postgres") ?? targets[0] ?? null
    }
    if (!target) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Resource link is not ready",
      })
    }
    try {
      return await backupService.restore(input.id, input.backupId, target)
    } catch (error) {
      throwBackupError(error)
    }
  })

export const downloadBackup = authedProcedure
  .input(z.object({ id: z.string().min(1), backupId: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    await loadAccessibleProject(input.id, context.session!)
    try {
      const file = await backupService.download(input.id, input.backupId)
      return {
        storageKey: file.storageKey,
        contentType: file.contentType,
        base64: file.body.toString("base64"),
      }
    } catch (error) {
      throwBackupError(error)
    }
  })

export const pitrStatus = authedProcedure
  .input(
    z.object({
      id: z.string().min(1),
      resourceLinkId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const project = await loadAccessibleProject(input.id, context.session!)
    let resolved = input.resourceLinkId
      ? await getResourceTarget(input.id, input.resourceLinkId)
      : null
    if (!resolved) {
      const pg = await getPostgresCredentials(input.id)
      if (pg) {
        resolved = await getResourceTarget(input.id, pg.linkId)
      }
    }
    if (!resolved || resolved.kind !== "postgres") {
      return {
        enabled: false,
        stanza: project.id,
        windowStart: null,
        windowEnd: null,
        lastBaseBackupAt: null,
        message: "Postgres resource not ready",
      }
    }
    return pitrService.status(resolved.driver, {
      projectId: project.id,
      projectSlug: project.slug,
      resourceLinkId: resolved.resourceLinkId,
      credentials: resolved.credentials,
    })
  })

export const restorePitr = authedProcedure
  .input(
    z.object({
      id: z.string().min(1),
      targetAt: z.string().datetime(),
      confirmName: z.string().min(1),
      resourceLinkId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const project = await loadAccessibleProject(input.id, context.session!)
    if (input.confirmName !== project.name) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Type the project name to confirm restore",
      })
    }
    const pg = await getPostgresCredentials(project.id)
    if (!pg) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Postgres resource is not ready",
      })
    }
    const linkId = input.resourceLinkId ?? pg.linkId
    const target = await getResourceTarget(project.id, linkId)
    if (!target || target.kind !== "postgres") {
      throw new ORPCError("BAD_REQUEST", {
        message: "Postgres resource is not ready",
      })
    }
    return pitrService.restoreProjectToTime(
      project.id,
      project.slug,
      target.resourceLinkId,
      pg.credentials,
      target.driver,
      new Date(input.targetAt),
    )
  })

export const listPostgresRoles = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const project = await loadAccessibleProject(input.id, context.session!)
    const pg = await getPostgresCredentials(project.id)
    if (!pg) return []
    return postgresProvisioner.listRoles(project.slug, pg.credentials)
  })

export const createPostgresRole = authedProcedure
  .input(
    z.object({
      id: z.string().min(1),
      name: z
        .string()
        .min(1)
        .max(32)
        .regex(/^[a-z][a-z0-9_]*$/),
      preset: z.enum(["readwrite", "readonly"]).default("readonly"),
    }),
  )
  .handler(async ({ context, input }) => {
    const project = await loadAccessibleProject(input.id, context.session!)
    const pg = await getPostgresCredentials(project.id)
    if (!pg) {
      throw new ORPCError("BAD_REQUEST", { message: "Postgres not ready" })
    }
    return postgresProvisioner.createRole(
      project.slug,
      input.name,
      input.preset,
      pg.credentials,
    )
  })

export const rotatePostgresRole = authedProcedure
  .input(
    z.object({
      id: z.string().min(1),
      roleName: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }) => {
    const project = await loadAccessibleProject(input.id, context.session!)
    const pg = await getPostgresCredentials(project.id)
    if (!pg) {
      throw new ORPCError("BAD_REQUEST", { message: "Postgres not ready" })
    }
    const rotated = await postgresProvisioner.rotateRolePassword(
      input.roleName,
      pg.credentials,
    )

    const driver = resourceLinkService.driver("postgres")
    const updated = driver.principals?.applyPrimaryRotation?.(
      pg.credentials,
      project.slug,
      input.roleName,
      rotated.password,
    )
    if (updated) {
      await db
        .update(resourceLinks)
        .set({
          credentialsEncrypted: resourceLinkService.encrypt(updated),
        })
        .where(eq(resourceLinks.id, pg.linkId))
    }

    return rotated
  })

export const dropPostgresRole = authedProcedure
  .input(
    z.object({
      id: z.string().min(1),
      roleName: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }) => {
    const project = await loadAccessibleProject(input.id, context.session!)
    const pg = await getPostgresCredentials(project.id)
    if (!pg) {
      throw new ORPCError("BAD_REQUEST", { message: "Postgres not ready" })
    }
    await postgresProvisioner.dropRole(
      project.slug,
      input.roleName,
      pg.credentials,
    )
    return { ok: true as const }
  })

export const listRedisUsers = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const project = await loadAccessibleProject(input.id, context.session!)
    const redis = await getRedisCredentials(project.id)
    if (!redis) return []
    return redisProvisioner.listUsers(project.slug, redis.credentials)
  })

export const createRedisUser = authedProcedure
  .input(
    z.object({
      id: z.string().min(1),
      name: z
        .string()
        .min(1)
        .max(32)
        .regex(/^[a-z][a-z0-9_]*$/),
    }),
  )
  .handler(async ({ context, input }) => {
    const project = await loadAccessibleProject(input.id, context.session!)
    const redis = await getRedisCredentials(project.id)
    if (!redis) {
      throw new ORPCError("BAD_REQUEST", { message: "Redis not ready" })
    }
    return redisProvisioner.createUser(
      project.slug,
      input.name,
      redis.credentials,
    )
  })

export const rotateRedisUser = authedProcedure
  .input(
    z.object({
      id: z.string().min(1),
      username: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }) => {
    const project = await loadAccessibleProject(input.id, context.session!)
    const redis = await getRedisCredentials(project.id)
    if (!redis) {
      throw new ORPCError("BAD_REQUEST", { message: "Redis not ready" })
    }
    const rotated = await redisProvisioner.rotateUserPassword(
      project.slug,
      input.username,
      redis.credentials,
    )
    const driver = resourceLinkService.driver("redis")
    const updated = driver.principals?.applyPrimaryRotation?.(
      redis.credentials,
      project.slug,
      input.username,
      rotated.password,
    )
    if (updated) {
      await db
        .update(resourceLinks)
        .set({
          credentialsEncrypted: resourceLinkService.encrypt(updated),
        })
        .where(eq(resourceLinks.id, redis.linkId))
    }
    return rotated
  })

export const dropRedisUser = authedProcedure
  .input(
    z.object({
      id: z.string().min(1),
      username: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }) => {
    const project = await loadAccessibleProject(input.id, context.session!)
    const redis = await getRedisCredentials(project.id)
    if (!redis) {
      throw new ORPCError("BAD_REQUEST", { message: "Redis not ready" })
    }
    await redisProvisioner.dropUser(
      project.slug,
      input.username,
      redis.credentials,
    )
    return { ok: true as const }
  })

export const exportRedis = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const project = await loadAccessibleProject(input.id, context.session!)
    const redis = await getRedisCredentials(project.id)
    if (!redis) {
      throw new ORPCError("BAD_REQUEST", { message: "Redis not ready" })
    }
    const body = await redisProvisioner.exportNamespace(
      project.slug,
      redis.credentials,
    )
    return { base64: body.toString("base64") }
  })

export const importRedis = authedProcedure
  .input(
    z.object({
      id: z.string().min(1),
      base64: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }) => {
    const project = await loadAccessibleProject(input.id, context.session!)
    const redis = await getRedisCredentials(project.id)
    if (!redis) {
      throw new ORPCError("BAD_REQUEST", { message: "Redis not ready" })
    }
    const count = await redisProvisioner.importNamespace(
      project.slug,
      Buffer.from(input.base64, "base64"),
      redis.credentials,
    )
    return { imported: count }
  })

export const databaseOverview = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const project = await loadAccessibleProject(input.id, context.session!)
    const credentials = await getProjectCredentials(input.id)
    const links = await db
      .select()
      .from(resourceLinks)
      .where(eq(resourceLinks.projectId, project.id))

    const dataSvcs = await db
      .select()
      .from(services)
      .where(eq(services.projectId, project.id))
    const fromServices = dataSvcs
      .filter((s) => s.type === "postgres" || s.type === "redis")
      .map((s) => ({
        id: s.id,
        kind: s.type as "postgres" | "redis",
        source: "dedicated-container" as const,
        status:
          s.status === "running"
            ? ("ready" as const)
            : s.status === "error"
              ? ("error" as const)
              : ("provisioning" as const),
        capabilities: resourceLinkService.driver(
          s.type as "postgres" | "redis",
        ).capabilities,
      }))

    const resources =
      fromServices.length > 0
        ? fromServices
        : links.map((link) => {
            const kind = link.kind as "postgres" | "redis" | "s3"
            const driver = resourceLinkService.driver(kind)
            return {
              id: link.id,
              kind,
              source: link.source,
              status: link.status,
              capabilities: driver.capabilities,
            }
          })

    const pg = await getPostgresCredentials(project.id)
    const redis = await getRedisCredentials(project.id)
    const [pgRoles, redisUsers, pitr] = await Promise.all([
      pg
        ? postgresProvisioner
            .listRoles(project.slug, pg.credentials)
            .catch(() => [])
        : Promise.resolve([]),
      redis
        ? redisProvisioner
            .listUsers(project.slug, redis.credentials)
            .catch(() => [])
        : Promise.resolve([]),
      pg
        ? pitrService.status(resourceLinkService.driver("postgres"), {
            projectId: project.id,
            projectSlug: project.slug,
            resourceLinkId: pg.linkId,
            credentials: pg.credentials,
          })
        : Promise.resolve({
            enabled: false,
            stanza: project.id,
            windowStart: null,
            windowEnd: null,
            lastBaseBackupAt: null,
            message: "Postgres not ready",
          }),
    ])
    return {
      resources,
      postgres: credentials
        ? {
            host: credentials.database.host,
            port: credentials.database.port,
            database: credentials.database.database,
            user: credentials.database.user,
            url: credentials.database.url,
            resourceLinkId: pg?.linkId ?? null,
          }
        : null,
      redis: credentials
        ? {
            host: credentials.redis.host,
            port: credentials.redis.port,
            namespace: credentials.redis.namespace,
            url: credentials.redis.url,
            resourceLinkId: redis?.linkId ?? null,
          }
        : null,
      storage: credentials
        ? {
            endpoint: credentials.storage.endpoint,
            bucket: credentials.storage.bucket,
          }
        : null,
      pgRoles,
      redisUsers,
      pitr,
    }
  })
