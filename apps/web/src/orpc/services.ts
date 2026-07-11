import { ORPCError } from "@orpc/server"
import * as z from "zod"

import { eq } from "@deplow/db"
import {
  connectServiceGitInputSchema,
  createServiceInputSchema,
  listGitBranchesInputSchema,
  listGitReposInputSchema,
  updateServiceInputSchema,
} from "@deplow/shared"

import {
  encryptString,
  listRemoteBranches,
  listRemoteRepos,
  normalizeRepoUrl,
} from "@/lib/core"
import { resolveListTokenForUser } from "@/lib/git-auth"
import {
  db,
  dockerNodeExecutor,
  gitService,
  platformConfig,
  projects,
  proxyService,
  services,
} from "@/lib/services"

import { authedProcedure } from "./middleware"

async function ownedService(id: string, ownerId: string) {
  const [service] = await db.select().from(services).where(eq(services.id, id))
  if (!service)
    throw new ORPCError("NOT_FOUND", { message: "Service not found" })
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, service.projectId))
  if (!project || project.ownerId !== ownerId) {
    throw new ORPCError("NOT_FOUND", { message: "Service not found" })
  }
  return { service, project }
}

function summary(row: typeof services.$inferSelect) {
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
    git: {
      connected: Boolean(row.gitRepoUrl && row.gitWebhookSecretEncrypted),
      provider: row.gitProvider,
      repoUrl: row.gitRepoUrl,
      repoFullName: row.gitRepoFullName,
      branch: row.gitBranch ?? "main",
      webhookUrl: row.gitRepoUrl
        ? `${platformConfig.publicControlPlaneUrl}/api/webhooks/git/${row.id}`
        : null,
      authMethod: row.gitAuthMethod,
      webhookManaged: Boolean(row.gitRemoteWebhookId),
      lastDeliveryAt: row.gitLastDeliveryAt?.toISOString() ?? null,
      lastDeliveryStatus: row.gitLastDeliveryStatus,
      lastDeliveryError: row.gitLastDeliveryError,
      connectedAt: row.gitConnectedAt?.toISOString() ?? null,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export const list = authedProcedure
  .input(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))
    if (!project || project.ownerId !== context.session!.user.id) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" })
    }
    const rows = await db
      .select()
      .from(services)
      .where(eq(services.projectId, project.id))
    return rows.map(summary)
  })

export const get = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) =>
    summary((await ownedService(input.id, context.session!.user.id)).service),
  )

export const create = authedProcedure
  .input(createServiceInputSchema)
  .handler(async ({ context, input }) => {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))
    if (!project || project.ownerId !== context.session!.user.id) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found" })
    }
    const existing = await db
      .select()
      .from(services)
      .where(eq(services.projectId, project.id))
    if (existing.some((service) => service.name === input.name)) {
      throw new ORPCError("CONFLICT", {
        message: "Service name is already used",
      })
    }
    const id = crypto.randomUUID()
    await db.insert(services).values({
      id,
      projectId: project.id,
      name: input.name,
      slug: `${project.slug}-${input.name}`,
      type: input.type,
      containerPort: input.containerPort,
      isPrimary:
        input.type === "web" && !existing.some((service) => service.isPrimary),
      status: "ready",
    })
    return summary((await ownedService(id, context.session!.user.id)).service)
  })

export const update = authedProcedure
  .input(updateServiceInputSchema)
  .handler(async ({ context, input }) => {
    const { service } = await ownedService(input.id, context.session!.user.id)
    if (input.isPrimary && service.type !== "web") {
      throw new ORPCError("BAD_REQUEST", {
        message: "A worker cannot be primary",
      })
    }
    if (input.isPrimary) {
      const siblings = await db
        .select()
        .from(services)
        .where(eq(services.projectId, service.projectId))
      await Promise.all(
        siblings
          .filter((sibling) => sibling.isPrimary && sibling.id !== service.id)
          .map((sibling) =>
            db
              .update(services)
              .set({ isPrimary: false })
              .where(eq(services.id, sibling.id)),
          ),
      )
    }
    await db
      .update(services)
      .set({
        containerPort: input.containerPort,
        isPrimary: input.isPrimary,
        envJson: input.env ? JSON.stringify(input.env) : undefined,
      })
      .where(eq(services.id, service.id))
    return summary(
      (await ownedService(service.id, context.session!.user.id)).service,
    )
  })

export const destroy = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const { service, project } = await ownedService(
      input.id,
      context.session!.user.id,
    )
    if (service.isPrimary) {
      const siblings = await db
        .select()
        .from(services)
        .where(eq(services.projectId, project.id))
      if (siblings.length > 1) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Choose another primary service before deleting this one",
        })
      }
    }
    await proxyService.removeServiceRoute(service.id).catch(() => undefined)
    if (project.nodeId) {
      await dockerNodeExecutor
        .removeApp(project.nodeId, service.slug)
        .catch(() => undefined)
    }
    await db.delete(services).where(eq(services.id, service.id))
    return { ok: true as const }
  })

export const connectGit = authedProcedure
  .input(connectServiceGitInputSchema)
  .handler(async ({ context, input }) => {
    const { service } = await ownedService(
      input.serviceId,
      context.session!.user.id,
    )
    const secret =
      input.webhookSecret?.trim() || gitService.generateWebhookSecret()
    await db
      .update(services)
      .set({
        gitProvider: input.provider,
        gitRepoUrl: input.repoUrl,
        gitBranch: input.branch,
        gitRepoFullName: input.repoFullName ?? null,
        gitAuthMethod: input.authMethod ?? (input.accessToken ? "pat" : null),
        gitInstallationId: input.installationId ?? null,
        gitAccessTokenEncrypted: input.accessToken
          ? encryptString(
              input.accessToken,
              platformConfig.secretsEncryptionKey,
            )
          : null,
        gitWebhookSecretEncrypted: encryptString(
          secret,
          platformConfig.secretsEncryptionKey,
        ),
        gitConnectedAt: new Date(),
      })
      .where(eq(services.id, service.id))
    return {
      connected: true as const,
      webhookUrl: `${platformConfig.publicControlPlaneUrl}/api/webhooks/git/${service.id}`,
      webhookSecret: secret,
    }
  })

export const disconnectGit = authedProcedure
  .input(z.object({ serviceId: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const { service } = await ownedService(
      input.serviceId,
      context.session!.user.id,
    )
    await db
      .update(services)
      .set({
        gitProvider: null,
        gitRepoUrl: null,
        gitBranch: "main",
        gitWebhookSecretEncrypted: null,
        gitConnectedAt: null,
        gitLastDeliveryAt: null,
        gitLastDeliveryStatus: null,
        gitLastDeliveryError: null,
        gitAuthMethod: null,
        gitInstallationId: null,
        gitAccessTokenEncrypted: null,
        gitRemoteWebhookId: null,
        gitRepoFullName: null,
      })
      .where(eq(services.id, service.id))
    return { ok: true as const }
  })

export const listGitRepos = authedProcedure
  .input(listGitReposInputSchema)
  .handler(async ({ context, input }) => {
    const auth = await resolveListTokenForUser({
      userId: context.session!.user.id,
      provider: input.provider,
      explicitToken: input.token,
      installationId: input.installationId,
    })
    const result = await listRemoteRepos({
      provider: input.provider,
      token: auth.token,
      query: input.query,
    })
    return {
      ...result,
      usedPlatformToken: auth.source === "platform",
      authSource: auth.source,
      installationId: auth.installationId,
    }
  })

export const listGitBranches = authedProcedure
  .input(listGitBranchesInputSchema)
  .handler(async ({ context, input }) => {
    const auth = await resolveListTokenForUser({
      userId: context.session!.user.id,
      provider: input.provider,
      explicitToken: input.token,
    })
    return {
      branches: await listRemoteBranches({
        provider: input.provider,
        token: auth.token,
        fullName: input.fullName,
      }),
    }
  })

export const normalizeGitRepoUrl = authedProcedure
  .input(
    z.object({ provider: z.enum(["github", "gitlab"]), input: z.string() }),
  )
  .handler(async ({ input }) => ({
    repoUrl: normalizeRepoUrl(input.provider, input.input),
  }))
