import { ORPCError } from "@orpc/server"
import * as z from "zod"

import { desc, eq } from "@deplow/db"
import { createDeploymentInputSchema } from "@deplow/shared"

import { injectDeployEnv, selectBuildStrategy } from "@/lib/core"
import {
  buildService,
  db,
  deployments,
  dockerNodeExecutor,
  ensureLocalNodeId,
  getProjectCredentials,
  gitService,
  nodes,
  platformConfig,
  projects,
  proxyService,
  services,
} from "@/lib/services"

import { authedProcedure } from "./middleware"

function toSummary(row: typeof deployments.$inferSelect) {
  return {
    id: row.id,
    serviceId: row.serviceId,
    projectId: row.projectId,
    nodeId: row.nodeId,
    serviceName: row.serviceName,
    image: row.image,
    buildStrategy: row.buildStrategy,
    buildLogs: row.buildLogs,
    sourcePath: row.sourcePath,
    status: row.status,
    containerId: row.containerId,
    errorMessage: row.errorMessage,
    triggeredBy: row.triggeredBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

type DeployInput = {
  serviceId: string
  nodeId?: string | null
  image?: string
  sourcePath?: string
  fromGit?: boolean
  triggeredBy?: string
  options?: {
    env?: Record<string, string>
    publishPort?: number
    containerPort?: number
    command?: string[]
    entrypoint?: string[]
    readOnlyRootfs?: boolean
    image?: string
  }
}

async function loadOwnedService(serviceId: string, ownerId?: string) {
  const [service] = await db
    .select()
    .from(services)
    .where(eq(services.id, serviceId))
  if (!service) {
    throw new ORPCError("NOT_FOUND", { message: "Service not found" })
  }
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, service.projectId))
  if (!project || (ownerId && project.ownerId !== ownerId)) {
    throw new ORPCError("NOT_FOUND", { message: "Service not found" })
  }
  return { service, project }
}

export async function runServiceDeploy(input: DeployInput) {
  const { service, project } = await loadOwnedService(input.serviceId)
  if (input.fromGit && !service.gitRepoUrl) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Connect a Git repository before deploying this service",
    })
  }

  let nodeId = input.nodeId ?? project.nodeId
  if (!nodeId) {
    nodeId = await ensureLocalNodeId()
    await db.update(projects).set({ nodeId }).where(eq(projects.id, project.id))
  }
  const [node] = await db.select().from(nodes).where(eq(nodes.id, nodeId))
  if (!node || node.provider !== "docker") {
    throw new ORPCError("BAD_REQUEST", { message: "A Docker node is required" })
  }

  const image = input.image ?? input.options?.image
  let strategy = "railpack"
  if (!input.fromGit) {
    try {
      strategy = selectBuildStrategy({ image, sourcePath: input.sourcePath })
    } catch (error) {
      throw new ORPCError("BAD_REQUEST", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const id = crypto.randomUUID()
  await db.insert(deployments).values({
    id,
    serviceId: service.id,
    projectId: project.id,
    nodeId,
    serviceName: service.name,
    image: image ?? null,
    sourcePath: input.sourcePath ?? null,
    buildStrategy: strategy,
    status: "queued",
    triggeredBy: input.triggeredBy ?? "manual",
  })
  await db
    .update(services)
    .set({ status: "deploying", errorMessage: null })
    .where(eq(services.id, service.id))

  const [row] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, id))
  void executeDeploy(id, input).catch((error) => {
    console.error(`[deplow] service deploy ${id} crashed`, error)
  })
  return toSummary(row!)
}

/** Compatibility export for webhook adapters while they migrate to service terminology. */
export const runProductionDeploy = runServiceDeploy

async function executeDeploy(id: string, input: DeployInput): Promise<void> {
  const { service, project } = await loadOwnedService(input.serviceId)
  const [deployment] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, id))
  if (!deployment) return

  let image =
    input.image ?? input.options?.image ?? deployment.image ?? undefined
  let sourcePath = input.sourcePath ?? deployment.sourcePath ?? undefined
  let buildLogs = deployment.buildLogs ?? ""

  try {
    if (input.fromGit) {
      await db
        .update(deployments)
        .set({ status: "building" })
        .where(eq(deployments.id, id))
      const { resolveCloneAuthForProject } = await import("@/lib/git-auth")
      const auth = await resolveCloneAuthForProject({
        gitProvider: service.gitProvider,
        gitRepoUrl: service.gitRepoUrl,
        gitAuthMethod: service.gitAuthMethod,
        gitInstallationId: service.gitInstallationId,
        gitAccessTokenEncrypted: service.gitAccessTokenEncrypted,
        ownerId: project.ownerId,
      })
      const clone = await gitService.syncRepo({
        projectId: service.id,
        repoUrl: service.gitRepoUrl!,
        branch: service.gitBranch || "main",
        auth: auth
          ? { ...auth, provider: service.gitProvider ?? "github" }
          : undefined,
      })
      sourcePath = clone.sourcePath
      buildLogs = clone.logs
    }

    const strategy = selectBuildStrategy({ image, sourcePath })
    if (strategy !== "image") {
      if (!sourcePath) throw new Error("Source path is required")
      await db
        .update(deployments)
        .set({ status: "building", sourcePath, buildLogs: buildLogs || null })
        .where(eq(deployments.id, id))
      const built = await buildService.buildFromSource({
        sourcePath,
        projectSlug: `${project.slug}-${service.name}`,
        deploymentId: id,
      })
      image = built.image
      buildLogs = [buildLogs, built.logs].filter(Boolean).join("\n")
    }
    if (!image) throw new Error("No image resolved for deploy")

    await db
      .update(deployments)
      .set({ status: "deploying", image, buildLogs: buildLogs || null })
      .where(eq(deployments.id, id))

    const credentials = await getProjectCredentials(project.id)
    const serviceEnv = service.envJson
      ? (JSON.parse(service.envJson) as Record<string, string>)
      : {}
    const env = credentials
      ? injectDeployEnv(credentials, platformConfig, {
          ...serviceEnv,
          ...(input.options?.env ?? {}),
          SERVICE_NAME: service.name,
          PROJECT_NAME: project.name,
          ...(service.type === "web"
            ? {
                PORT: String(
                  input.options?.containerPort ?? service.containerPort,
                ),
              }
            : {}),
        })
      : { ...serviceEnv, ...(input.options?.env ?? {}) }

    const containerPort = input.options?.containerPort ?? service.containerPort
    const result = await dockerNodeExecutor.deployApp(deployment.nodeId, {
      image,
      serviceName: service.slug,
      env,
      publishPort:
        service.type === "web" ? input.options?.publishPort : undefined,
      containerPort,
      projectId: project.id,
      serviceId: service.id,
      serviceType: service.type,
      command: input.options?.command,
      entrypoint: input.options?.entrypoint,
      readOnlyRootfs: input.options?.readOnlyRootfs,
    })

    let publicUrl: string | null = null
    if (service.type === "web") {
      const route = await proxyService.upsertServiceRoute({
        serviceId: service.id,
        projectSlug: project.slug,
        serviceName: service.name,
        isPrimary: service.isPrimary,
        upstream: dockerNodeExecutor.proxyUpstream(
          deployment.nodeId,
          service.slug,
          containerPort,
        ),
      })
      publicUrl = route.publicUrl
    }

    await db
      .update(deployments)
      .set({
        status: "running",
        containerId: result.containerId,
        image,
        buildStrategy: strategy,
        buildLogs: buildLogs || null,
        errorMessage: null,
      })
      .where(eq(deployments.id, id))
    await db
      .update(services)
      .set({
        status: "running",
        containerId: result.containerId,
        image,
        publicUrl,
        errorMessage: null,
      })
      .where(eq(services.id, service.id))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(deployments)
      .set({
        status: "failed",
        errorMessage: message,
        buildLogs: buildLogs || message,
      })
      .where(eq(deployments.id, id))
    await db
      .update(services)
      .set({ status: "error", errorMessage: message })
      .where(eq(services.id, service.id))
  }
}

export const list = authedProcedure
  .input(
    z.object({
      projectId: z.string().min(1).optional(),
      serviceId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    if (input.serviceId) {
      await loadOwnedService(input.serviceId, context.session!.user.id)
    } else if (input.projectId) {
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))
      if (!project || project.ownerId !== context.session!.user.id) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" })
      }
    } else {
      throw new ORPCError("BAD_REQUEST", {
        message: "serviceId or projectId is required",
      })
    }
    const rows = await db
      .select()
      .from(deployments)
      .where(
        input.serviceId
          ? eq(deployments.serviceId, input.serviceId)
          : eq(deployments.projectId, input.projectId!),
      )
      .orderBy(desc(deployments.createdAt))
    return rows.map(toSummary)
  })

export const get = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const [row] = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, input.id))
    if (!row)
      throw new ORPCError("NOT_FOUND", { message: "Deployment not found" })
    await loadOwnedService(row.serviceId, context.session!.user.id)
    return toSummary(row)
  })

export const create = authedProcedure
  .input(createDeploymentInputSchema)
  .handler(async ({ context, input }) => {
    await loadOwnedService(input.serviceId, context.session!.user.id)
    return runServiceDeploy(input)
  })

export const logs = authedProcedure
  .input(z.object({ serviceId: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const { service, project } = await loadOwnedService(
      input.serviceId,
      context.session!.user.id,
    )
    return {
      logs: await dockerNodeExecutor.getLogs(
        project.nodeId ?? (await ensureLocalNodeId()),
        service.slug,
      ),
    }
  })

export const stop = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const [row] = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, input.id))
    if (!row)
      throw new ORPCError("NOT_FOUND", { message: "Deployment not found" })
    const { service } = await loadOwnedService(
      row.serviceId,
      context.session!.user.id,
    )
    await dockerNodeExecutor.stopApp(row.nodeId, service.slug)
    await proxyService.removeServiceRoute(service.id).catch(() => undefined)
    await db
      .update(deployments)
      .set({ status: "stopped" })
      .where(eq(deployments.id, row.id))
    await db
      .update(services)
      .set({ status: "stopped", publicUrl: null })
      .where(eq(services.id, service.id))
    return { ok: true as const }
  })

export const retry = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const [row] = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, input.id))
    if (!row)
      throw new ORPCError("NOT_FOUND", { message: "Deployment not found" })
    await loadOwnedService(row.serviceId, context.session!.user.id)
    return runServiceDeploy({
      serviceId: row.serviceId,
      nodeId: row.nodeId,
      image: row.sourcePath ? undefined : (row.image ?? undefined),
      sourcePath: row.sourcePath ?? undefined,
      triggeredBy: "retry",
    })
  })

export const rollback = authedProcedure
  .input(
    z.object({
      serviceId: z.string().min(1),
      deploymentId: z.string().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    await loadOwnedService(input.serviceId, context.session!.user.id)
    const rows = await db
      .select()
      .from(deployments)
      .where(eq(deployments.serviceId, input.serviceId))
      .orderBy(desc(deployments.createdAt))
    const target = input.deploymentId
      ? rows.find((row) => row.id === input.deploymentId)
      : rows.filter((row) => row.image && row.status === "running")[1]
    if (!target?.image) {
      throw new ORPCError("BAD_REQUEST", {
        message: "No previous image is available",
      })
    }
    return runServiceDeploy({
      serviceId: input.serviceId,
      nodeId: target.nodeId,
      image: target.image,
      triggeredBy: "rollback",
    })
  })
