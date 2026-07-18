import { ORPCError } from "@orpc/server"
import * as z from "zod"

import { eq } from "@deplow/db"
import {
  analyzeSourceInputSchema,
  connectServiceGitInputSchema,
  createAndDeployServiceInputSchema,
  createServiceInputSchema,
  listGitBranchesInputSchema,
  listGitReposInputSchema,
  updateServiceInputSchema,
  type BuildStrategyOverride,
} from "@deplow/shared"

import { assertProjectAccess } from "@/lib/access"
import {
  analyzeRemote,
  assertAnalysisFresh,
  fingerprintAnalysis,
  fingerprintsMatch,
  listInstallationRepos,
  listRemoteBranches,
  listRemoteRepos,
  normalizeRepoUrl,
  STALE_GITHUB_CREDS_MESSAGE,
  STALE_GITLAB_CREDS_MESSAGE,
  toPublicAnalysis,
} from "@/lib/core"
import { resolveListTokenForUser } from "@/lib/git-auth"
import {
  ServiceLifecycleError,
  serviceLifecycle,
} from "@/lib/service-lifecycle"
import {
  db,
  enqueueServiceProvision,
  ensureBindingsMigrated,
  gitService,
  platformConfig,
  serviceBindings,
  services,
} from "@/lib/services"

import { authedProcedure } from "./middleware"
import type { Session } from "@/lib/auth"

function lifecycleError(e: unknown): never {
  if (e instanceof ServiceLifecycleError) {
    throw new ORPCError(e.code, { message: e.message })
  }
  throw e
}

async function accessibleService(id: string, session: Session) {
  const [service] = await db.select().from(services).where(eq(services.id, id))
  if (!service)
    throw new ORPCError("NOT_FOUND", { message: "Service not found" })
  const project = await assertProjectAccess(service.projectId, session)
  return { service, project }
}

function parseWatchPaths(raw: string | null | undefined): string[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const paths = parsed.filter(
      (p): p is string => typeof p === "string" && p.trim().length > 0,
    )
    return paths.length > 0 ? paths : null
  } catch {
    return null
  }
}

function encodeWatchPaths(
  paths: string[] | null | undefined,
): string | null | undefined {
  if (paths === undefined) return undefined
  if (paths === null || paths.length === 0) return null
  return JSON.stringify(paths)
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
    errorCode: row.errorCode,
    lastOperationId: row.lastOperationId,
    env: row.envJson ? (JSON.parse(row.envJson) as Record<string, string>) : {},
    rootDirectory: row.rootDirectory,
    buildStrategyOverride:
      (row.buildStrategyOverride as BuildStrategyOverride | null) ?? null,
    dockerfilePath: row.dockerfilePath,
    buildCommand: row.buildCommand,
    startCommand: row.startCommand,
    healthCheckPath: row.healthCheckPath,
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
      watchPaths: parseWatchPaths(row.gitWatchPaths),
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export const list = authedProcedure
  .input(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const project = await assertProjectAccess(input.projectId, context.session!)
    const rows = await db
      .select()
      .from(services)
      .where(eq(services.projectId, project.id))
    return rows.map(summary)
  })

export const get = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const { service, project } = await accessibleService(
      input.id,
      context.session!,
    )
    await ensureBindingsMigrated(project.id).catch(() => undefined)
    const bindings = await db
      .select()
      .from(serviceBindings)
      .where(eq(serviceBindings.consumerServiceId, service.id))
    const providers = await Promise.all(
      bindings.map(async (b) => {
        const [provider] = await db
          .select()
          .from(services)
          .where(eq(services.id, b.providerServiceId))
        return {
          id: b.id,
          envKey: b.envKey,
          principal: b.principal,
          providerServiceId: b.providerServiceId,
          providerName: provider?.name ?? null,
          providerType: provider?.type ?? null,
        }
      }),
    )
    return { ...summary(service), bindings: providers }
  })

export const create = authedProcedure
  .input(createServiceInputSchema)
  .handler(async ({ context, input }) => {
    await assertProjectAccess(input.projectId, context.session!)
    let created: Awaited<ReturnType<typeof serviceLifecycle.create>>
    try {
      created = await serviceLifecycle.create({
        projectId: input.projectId,
        name: input.name,
        type: input.type,
        containerPort: input.containerPort,
      })
    } catch (e) {
      if (
        e instanceof ServiceLifecycleError &&
        e.message.includes("already used")
      ) {
        throw new ORPCError("CONFLICT", { message: e.message })
      }
      lifecycleError(e)
    }

    let operationId: string | null = null
    if (created.shouldProvision) {
      const result = await enqueueServiceProvision(created.serviceId)
      operationId = result.operationId
    }

    const service = summary(
      (await accessibleService(created.serviceId, context.session!)).service,
    )
    return { ...service, operationId }
  })

export const analyzeSource = authedProcedure
  .input(analyzeSourceInputSchema)
  .handler(async ({ context, input }) => {
    const userId = context.session!.user.id
    let auth: { token: string; username?: string; host?: string } | undefined
    try {
      const resolved = await resolveListTokenForUser({
        userId,
        provider: input.provider,
        explicitToken: input.accessToken,
        installationId: input.installationId,
      })
      auth = {
        token: resolved.token,
        username: input.provider === "gitlab" ? "oauth2" : "x-access-token",
      }
    } catch {
      // Public repos may clone without auth
      auth = undefined
    }

    try {
      const result = await analyzeRemote({
        repoUrl: input.repoUrl,
        branch: input.branch,
        repoFullName: input.repoFullName,
        rootDirectory: input.rootDirectory,
        dockerfilePath: input.dockerfilePath,
        strategyOverride: input.strategyOverride,
        auth: auth ? { ...auth, provider: input.provider } : undefined,
        gitService,
        // Resolved inside analyzeDirectory via resolveRailpackBin
        cloneRoot: platformConfig.gitCloneRoot,
      })
      return toPublicAnalysis(result)
    } catch (error) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          error instanceof Error
            ? error.message
            : "Failed to analyze repository",
      })
    }
  })

export const createAndDeploy = authedProcedure
  .input(createAndDeployServiceInputSchema)
  .handler(async ({ context, input }) => {
    const project = await assertProjectAccess(input.projectId, context.session!)

    const expectedFingerprint = fingerprintAnalysis({
      repoUrl: input.repoUrl,
      branch: input.branch,
      rootDirectory: input.rootDirectory ?? input.fingerprint.rootDirectory,
      dockerfilePath:
        input.dockerfilePath !== undefined
          ? input.dockerfilePath
          : input.fingerprint.dockerfilePath,
    })

    let analysis
    try {
      analysis = assertAnalysisFresh({
        analysisId: input.analysisId,
        fingerprint: input.fingerprint,
      })
    } catch (error) {
      throw new ORPCError("BAD_REQUEST", {
        message: error instanceof Error ? error.message : String(error),
      })
    }

    if (!fingerprintsMatch(analysis.fingerprint, expectedFingerprint)) {
      // Allow advanced overrides that change root/dockerfile after analysis,
      // but repo URL + branch must still match.
      if (
        analysis.fingerprint.repoUrl !== expectedFingerprint.repoUrl ||
        analysis.fingerprint.branch !== expectedFingerprint.branch
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Repository or branch changed—re-run analysis.",
        })
      }
    }

    if (analysis.needsChoice) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          analysis.needsChoice === "dockerfile"
            ? "Multiple Dockerfiles found—select one."
            : "Multiple applications found—select one.",
      })
    }

    const strategyOverride = input.buildStrategyOverride ?? "auto"
    const dockerfilePath =
      input.dockerfilePath !== undefined
        ? input.dockerfilePath
        : analysis.dockerfilePath
    const rootDirectory = input.rootDirectory ?? analysis.applicationRoot ?? "."
    const startCommand =
      input.startCommand !== undefined
        ? input.startCommand
        : analysis.startCommand
    const buildCommand =
      input.buildCommand !== undefined
        ? input.buildCommand
        : analysis.buildCommand

    if (strategyOverride === "railpack" && !startCommand?.trim()) {
      throw new ORPCError("BAD_REQUEST", {
        message: "No start command detected.",
      })
    }
    if (
      strategyOverride === "auto" &&
      analysis.strategy === "railpack" &&
      !startCommand?.trim() &&
      analysis.errors.some((e) => /start command/i.test(e))
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message: "No start command detected.",
      })
    }

    const type = input.type
    const containerPort =
      type === "web" ? (input.containerPort ?? 80) : (input.containerPort ?? 80)
    const secret = gitService.generateWebhookSecret()

    let result: Awaited<ReturnType<typeof serviceLifecycle.createAndDeploy>>
    try {
      result = await serviceLifecycle.createAndDeploy({
        create: {
          projectId: project.id,
          name: input.name,
          type,
          containerPort,
        },
        git: {
          userId: context.session!.user.id,
          provider: input.provider,
          repoUrl: input.repoUrl,
          branch: input.branch,
          repoFullName: input.repoFullName,
          authMethod: input.authMethod ?? (input.accessToken ? "pat" : null),
          installationId: input.installationId,
          accessToken: input.accessToken,
          secret,
          autoWebhook: input.autoWebhook,
          buildFields: {
            buildStrategyOverride:
              strategyOverride === "auto" ? null : strategyOverride,
            dockerfilePath: dockerfilePath || null,
            rootDirectory: rootDirectory === "." ? null : rootDirectory,
            buildCommand: buildCommand || null,
            startCommand: startCommand || null,
            healthCheckPath: input.healthCheckPath || null,
          },
        },
        // Git-only create: no image → register webhook, skip deploy (templates use create + deploy with image).
      })
    } catch (e) {
      if (
        e instanceof ServiceLifecycleError &&
        e.message.includes("already used")
      ) {
        throw new ORPCError("CONFLICT", { message: e.message })
      }
      lifecycleError(e)
    }

    const service = summary(
      (await accessibleService(result.serviceId, context.session!)).service,
    )

    return {
      service,
      deployment: result.deployment,
      webhookUrl: result.webhook?.webhookUrl ?? null,
      webhookSecret: result.webhook?.webhookManaged ? null : secret,
      webhookWarning: result.webhook?.warning ?? null,
      webhookManaged: result.webhook?.webhookManaged ?? false,
    }
  })

export const update = authedProcedure
  .input(updateServiceInputSchema)
  .handler(async ({ context, input }) => {
    const { service } = await accessibleService(input.id, context.session!)
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
        rootDirectory:
          input.rootDirectory === undefined ? undefined : input.rootDirectory,
        buildStrategyOverride:
          input.buildStrategyOverride === undefined
            ? undefined
            : input.buildStrategyOverride,
        dockerfilePath:
          input.dockerfilePath === undefined ? undefined : input.dockerfilePath,
        buildCommand:
          input.buildCommand === undefined ? undefined : input.buildCommand,
        startCommand:
          input.startCommand === undefined ? undefined : input.startCommand,
        healthCheckPath:
          input.healthCheckPath === undefined
            ? undefined
            : input.healthCheckPath,
        gitWatchPaths:
          input.gitWatchPaths === undefined
            ? undefined
            : encodeWatchPaths(input.gitWatchPaths),
      })
      .where(eq(services.id, service.id))
    return summary(
      (await accessibleService(service.id, context.session!)).service,
    )
  })

export const destroy = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    await accessibleService(input.id, context.session!)
    try {
      return await serviceLifecycle.destroy({
        serviceId: input.id,
        userId: context.session!.user.id,
      })
    } catch (e) {
      lifecycleError(e)
    }
  })

export const retryProvision = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const { service } = await accessibleService(input.id, context.session!)
    if (service.type !== "postgres" && service.type !== "redis") {
      throw new ORPCError("BAD_REQUEST", {
        message: "Only postgres/redis services can be re-provisioned",
      })
    }
    const result = await enqueueServiceProvision(service.id)
    return {
      ...summary(
        (await accessibleService(service.id, context.session!)).service,
      ),
      operationId: result.operationId,
    }
  })

export const connectGit = authedProcedure
  .input(connectServiceGitInputSchema)
  .handler(async ({ context, input }) => {
    await accessibleService(input.serviceId, context.session!)
    try {
      return await serviceLifecycle.connectGit({
        userId: context.session!.user.id,
        serviceId: input.serviceId,
        provider: input.provider,
        repoUrl: input.repoUrl,
        branch: input.branch,
        repoFullName: input.repoFullName,
        authMethod: input.authMethod ?? (input.accessToken ? "pat" : null),
        installationId: input.installationId,
        accessToken: input.accessToken,
        webhookSecret: input.webhookSecret,
        gitWatchPaths: input.gitWatchPaths,
        autoWebhook: input.autoWebhook,
      })
    } catch (e) {
      lifecycleError(e)
    }
  })

export const disconnectGit = authedProcedure
  .input(z.object({ serviceId: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    await accessibleService(input.serviceId, context.session!)
    try {
      return await serviceLifecycle.disconnectGit({
        userId: context.session!.user.id,
        serviceId: input.serviceId,
      })
    } catch (e) {
      lifecycleError(e)
    }
  })

function throwGitListError(
  error: unknown,
  provider?: "github" | "gitlab",
): never {
  if (error instanceof ORPCError) throw error
  const raw =
    error instanceof Error ? error.message : String(error)
  const message = mapGitCredentialErrorMessage(raw, provider)
  throw new ORPCError("BAD_REQUEST", { message })
}

function mapGitCredentialErrorMessage(
  message: string,
  provider?: "github" | "gitlab",
): string {
  if (
    message.includes("Unsupported state or unable to authenticate data") ||
    message.includes("bad decrypt") ||
    message.includes("Invalid authentication tag")
  ) {
    return provider === "gitlab"
      ? STALE_GITLAB_CREDS_MESSAGE
      : STALE_GITHUB_CREDS_MESSAGE
  }
  // Installation token mint failures
  if (
    message.includes("GitHub installation token failed") ||
    message.includes("installation token")
  ) {
    return provider === "github"
      ? "Could not mint a GitHub App installation token. Reconnect GitHub or reinstall the App on the organization."
      : message
  }
  return message
}

export const listGitRepos = authedProcedure
  .input(listGitReposInputSchema)
  .handler(async ({ context, input }) => {
    try {
      const auth = await resolveListTokenForUser({
        userId: context.session!.user.id,
        provider: input.provider,
        explicitToken: input.token,
        installationId: input.installationId,
      })

      // Installation tokens cannot call /user/repos — use the installation API.
      if (auth.source === "github_app") {
        const repos = await listInstallationRepos({
          installationToken: auth.token,
          query: input.query,
        })
        return {
          repos,
          truncated: false,
          usedPlatformToken: false,
          authSource: auth.source,
          installationId: auth.installationId,
        }
      }

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
    } catch (error) {
      throwGitListError(error, input.provider)
    }
  })

export const listGitBranches = authedProcedure
  .input(listGitBranchesInputSchema)
  .handler(async ({ context, input }) => {
    try {
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
    } catch (error) {
      throwGitListError(error, input.provider)
    }
  })

export const normalizeGitRepoUrl = authedProcedure
  .input(
    z.object({ provider: z.enum(["github", "gitlab"]), input: z.string() }),
  )
  .handler(async ({ input }) => ({
    repoUrl: normalizeRepoUrl(input.provider, input.input),
  }))
