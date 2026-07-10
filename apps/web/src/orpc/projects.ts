import { ORPCError } from "@orpc/server"
import * as z from "zod"

import {
  connectGitInputSchema,
  createProjectInputSchema,
  listGitBranchesInputSchema,
  listGitReposInputSchema,
} from "@deplow/shared"
import { eq } from "@deplow/db"

import {
  BackupScheduler,
  assertProductionSlug,
  encryptString,
  decryptString,
  listRemoteBranches,
  listRemoteRepos,
  normalizeRepoUrl,
} from "@/lib/core"
import {
  backupScheduler,
  backupService,
  db,
  decryptProjectCredentials,
  dockerNodeExecutor,
  ensureLocalNodeId,
  gitService,
  platformConfig,
  projects,
  proxyService,
  provisioningService,
  scheduleProjectBackups,
} from "@/lib/services"

import { authedProcedure } from "./middleware"

function webhookUrlFor(projectId: string): string {
  return `${platformConfig.publicControlPlaneUrl}/api/webhooks/git/${projectId}`
}

function toSummary(row: typeof projects.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    nodeId: row.nodeId,
    // Resolve from live proxy config so older rows (created before base domain)
    // and env changes still show a URL in the UI.
    publicUrl: row.publicUrl ?? proxyService.publicUrlForSlug(row.slug),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    errorMessage: row.errorMessage,
    backupIntervalMs: row.backupIntervalMs,
    lastBackupAt: row.lastBackupAt ? row.lastBackupAt.toISOString() : null,
  }
}

function toGitStatus(row: typeof projects.$inferSelect) {
  const connected = Boolean(row.gitRepoUrl && row.gitWebhookSecretEncrypted)
  return {
    connected,
    provider: (row.gitProvider as "github" | "gitlab" | null) ?? null,
    repoUrl: row.gitRepoUrl,
    branch: row.gitBranch ?? "main",
    webhookUrl: connected ? webhookUrlFor(row.id) : null,
    lastDeliveryAt: row.gitLastDeliveryAt
      ? row.gitLastDeliveryAt.toISOString()
      : null,
    lastDeliveryStatus: row.gitLastDeliveryStatus,
    lastDeliveryError: row.gitLastDeliveryError,
    connectedAt: row.gitConnectedAt ? row.gitConnectedAt.toISOString() : null,
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
      git: toGitStatus(row),
    }
  })

export const create = authedProcedure
  .input(createProjectInputSchema)
  .handler(async ({ context, input }) => {
    const ownerId = context.session!.user.id
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
    if (existing.length > 0) {
      throw new ORPCError("CONFLICT", {
        message: `Project name "${input.name}" is already taken`,
      })
    }

    const nodeId = await ensureLocalNodeId()
    const projectId = crypto.randomUUID()
    const backupIntervalMs = BackupScheduler.defaultIntervalMs()
    const publicUrl = proxyService.publicUrlForSlug(input.name)

    await db.insert(projects).values({
      id: projectId,
      name: input.name,
      slug: input.name,
      ownerId,
      nodeId,
      status: "provisioning",
      backupIntervalMs,
      publicUrl,
    })

    try {
      const result = await provisioningService.createProject({
        ...input,
        projectId,
      })

      let gitProvider: string | null = null
      let gitRepoUrl: string | null = null
      let gitBranch: string | null = "main"
      let gitWebhookSecretEncrypted: string | null = null
      let gitConnectedAt: Date | null = null

      const repoUrl = input.gitRepoUrl?.trim()
      if (repoUrl) {
        const secret = gitService.generateWebhookSecret()
        gitProvider = gitService.detectProvider(repoUrl)
        gitRepoUrl = repoUrl
        gitBranch = "main"
        gitWebhookSecretEncrypted = encryptString(
          secret,
          platformConfig.secretsEncryptionKey,
        )
        gitConnectedAt = new Date()
      }

      await db
        .update(projects)
        .set({
          status: "ready",
          credentialsEncrypted: result.credentialsEncrypted,
          secretsYaml: result.secrets,
          errorMessage: null,
          backupIntervalMs,
          nodeId,
          publicUrl,
          gitProvider,
          gitRepoUrl,
          gitBranch,
          gitWebhookSecretEncrypted,
          gitConnectedAt,
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
        git: toGitStatus(row!),
        spawnedServerId: result.spawnedServerId,
        /** Only returned once at create when git was connected */
        webhookSecret: repoUrl
          ? decryptString(
              row!.gitWebhookSecretEncrypted!,
              platformConfig.secretsEncryptionKey,
            )
          : undefined,
        webhookUrl: repoUrl ? webhookUrlFor(projectId) : undefined,
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
    await proxyService.removeProjectRoute(row.id).catch(() => undefined)

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

export const connectGit = authedProcedure
  .input(connectGitInputSchema)
  .handler(async ({ context, input }) => {
    const ownerId = context.session!.user.id
    const [row] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))
    if (!row || row.ownerId !== ownerId) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" })
    }

    const secret =
      input.webhookSecret?.trim() || gitService.generateWebhookSecret()
    const encrypted = encryptString(secret, platformConfig.secretsEncryptionKey)

    await db
      .update(projects)
      .set({
        gitProvider: input.provider,
        gitRepoUrl: input.repoUrl,
        gitBranch: input.branch,
        gitWebhookSecretEncrypted: encrypted,
        gitConnectedAt: new Date(),
        gitLastDeliveryError: null,
        gitLastDeliveryStatus: null,
      })
      .where(eq(projects.id, row.id))

    return {
      connected: true as const,
      provider: input.provider,
      repoUrl: input.repoUrl,
      branch: input.branch,
      webhookUrl: webhookUrlFor(row.id),
      webhookSecret: secret,
    }
  })

export const disconnectGit = authedProcedure
  .input(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const ownerId = context.session!.user.id
    const [row] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))
    if (!row || row.ownerId !== ownerId) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" })
    }
    await db
      .update(projects)
      .set({
        gitProvider: null,
        gitRepoUrl: null,
        gitBranch: "main",
        gitWebhookSecretEncrypted: null,
        gitConnectedAt: null,
        gitLastDeliveryAt: null,
        gitLastDeliveryStatus: null,
        gitLastDeliveryError: null,
      })
      .where(eq(projects.id, row.id))
    return { ok: true as const }
  })

function resolveGitToken(
  provider: "github" | "gitlab",
  token?: string,
): string {
  const fromInput = token?.trim()
  if (fromInput) return fromInput
  const platform =
    provider === "github"
      ? platformConfig.githubToken
      : platformConfig.gitlabToken
  if (platform) return platform
  throw new ORPCError("BAD_REQUEST", {
    message:
      provider === "github"
        ? "Paste a GitHub personal access token (repo scope), or set DEPLOW_GITHUB_TOKEN on the server."
        : "Paste a GitLab personal access token (read_api), or set DEPLOW_GITLAB_TOKEN on the server.",
  })
}

export const listGitRepos = authedProcedure
  .input(listGitReposInputSchema)
  .handler(async ({ input }) => {
    try {
      const token = resolveGitToken(input.provider, input.token)
      const result = await listRemoteRepos({
        provider: input.provider,
        token,
        query: input.query,
      })
      return {
        repos: result.repos,
        truncated: result.truncated,
        usedPlatformToken: !input.token?.trim(),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new ORPCError("BAD_REQUEST", { message })
    }
  })

export const listGitBranches = authedProcedure
  .input(listGitBranchesInputSchema)
  .handler(async ({ input }) => {
    try {
      const token = resolveGitToken(input.provider, input.token)
      const branches = await listRemoteBranches({
        provider: input.provider,
        token,
        fullName: input.fullName,
      })
      return { branches }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new ORPCError("BAD_REQUEST", { message })
    }
  })

/** Resolve owner/repo shorthand before connect when needed. */
export const normalizeGitRepoUrl = authedProcedure
  .input(
    z.object({
      provider: z.enum(["github", "gitlab"]),
      input: z.string().min(1),
    }),
  )
  .handler(async ({ input }) => {
    try {
      return { repoUrl: normalizeRepoUrl(input.provider, input.input) }
    } catch (error) {
      throw new ORPCError("BAD_REQUEST", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })
