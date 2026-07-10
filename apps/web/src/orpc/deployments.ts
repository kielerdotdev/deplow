import { ORPCError } from "@orpc/server"
import * as z from "zod"

import { desc, eq } from "@deplow/db"
import { createDeploymentInputSchema } from "@deplow/shared"

import {
  buildService,
  db,
  decryptProjectCredentials,
  deployments,
  dockerNodeExecutor,
  ensureLocalNodeId,
  nodes,
  platformConfig,
  projects,
  proxyService,
} from "@/lib/services"
import { injectDeployEnv, selectBuildStrategy } from "@/lib/core"

import { authedProcedure } from "./middleware"

function toSummary(row: typeof deployments.$inferSelect) {
  return {
    id: row.id,
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

type DeploymentSummary = ReturnType<typeof toSummary>

async function assertProjectOwner(projectId: string, ownerId: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
  if (!row || row.ownerId !== ownerId) {
    throw new ORPCError("NOT_FOUND", { message: "Project not found" })
  }
  return row
}

/** Shared production deploy pipeline used by create / retry / rollback / webhooks. */
export async function runProductionDeploy(input: {
  projectId: string
  nodeId?: string | null
  serviceName?: string
  image?: string
  sourcePath?: string
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
}): Promise<DeploymentSummary> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, input.projectId))
  if (!project) {
    throw new ORPCError("NOT_FOUND", { message: "Project not found" })
  }

  let nodeId = input.nodeId ?? project.nodeId ?? undefined
  if (!nodeId) {
    nodeId = await ensureLocalNodeId()
    await db.update(projects).set({ nodeId }).where(eq(projects.id, project.id))
  }

  const [node] = await db.select().from(nodes).where(eq(nodes.id, nodeId))
  if (!node) {
    throw new ORPCError("NOT_FOUND", { message: "Node not found" })
  }
  if (node.provider !== "docker") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Only docker nodes are supported",
    })
  }

  const serviceName = input.serviceName || "app"
  const credentials = decryptProjectCredentials(project.credentialsEncrypted)
  const env = credentials
    ? injectDeployEnv(credentials, platformConfig, input.options?.env ?? {})
    : { ...(input.options?.env ?? {}) }

  const imageInput = input.image ?? input.options?.image
  const sourcePath = input.sourcePath

  let strategy: string
  try {
    strategy = selectBuildStrategy({
      image: imageInput,
      sourcePath,
    })
  } catch (error) {
    throw new ORPCError("BAD_REQUEST", {
      message: error instanceof Error ? error.message : String(error),
    })
  }

  const id = crypto.randomUUID()
  await db.insert(deployments).values({
    id,
    projectId: input.projectId,
    nodeId,
    serviceName,
    image: imageInput,
    sourcePath: sourcePath ?? null,
    buildStrategy: strategy,
    dockerCompose: null,
    status: "queued",
    triggeredBy: input.triggeredBy ?? "manual",
  })

  let buildLogs = ""
  let image = imageInput

  try {
    if (strategy === "dockerfile" || strategy === "railpack") {
      if (!sourcePath) {
        throw new Error("sourcePath required for source builds")
      }
      await db
        .update(deployments)
        .set({ status: "building" })
        .where(eq(deployments.id, id))

      const built = await buildService.buildFromSource({
        sourcePath,
        projectSlug: project.slug,
        deploymentId: id,
      })
      image = built.image
      buildLogs = built.logs
      await db
        .update(deployments)
        .set({
          image,
          buildLogs,
          buildStrategy: built.strategy,
          status: "deploying",
        })
        .where(eq(deployments.id, id))
    } else {
      await db
        .update(deployments)
        .set({ status: "deploying" })
        .where(eq(deployments.id, id))
    }

    if (!image) {
      throw new Error("No image resolved for deploy")
    }

    const containerPort = input.options?.containerPort ?? 80
    const result = await dockerNodeExecutor.deployApp(nodeId, {
      image,
      serviceName,
      env,
      publishPort: input.options?.publishPort,
      containerPort,
      projectId: input.projectId,
      command: input.options?.command,
      entrypoint: input.options?.entrypoint,
      readOnlyRootfs: input.options?.readOnlyRootfs,
    })

    const upstream = dockerNodeExecutor.proxyUpstream(
      nodeId,
      serviceName,
      containerPort,
    )
    const route = await proxyService.upsertProductionRoute({
      projectId: project.id,
      slug: project.slug,
      upstream,
    })
    if (route.publicUrl) {
      await db
        .update(projects)
        .set({ publicUrl: route.publicUrl })
        .where(eq(projects.id, project.id))
    }

    await db
      .update(deployments)
      .set({
        status: "running",
        containerId: result.containerId,
        image,
        buildLogs: buildLogs || null,
        errorMessage: null,
      })
      .where(eq(deployments.id, id))
    const [row] = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, id))
    return toSummary(row!)
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
    if (
      message.includes("gVisor runtime") ||
      message.includes("is not installed") ||
      message.includes("is not available")
    ) {
      throw new ORPCError("BAD_REQUEST", { message })
    }
    throw new ORPCError("INTERNAL_SERVER_ERROR", { message })
  }
}

export const list = authedProcedure
  .input(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    await assertProjectOwner(input.projectId, context.session!.user.id)
    const rows = await db
      .select()
      .from(deployments)
      .where(eq(deployments.projectId, input.projectId))
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
    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Deployment not found" })
    }
    await assertProjectOwner(row.projectId, context.session!.user.id)
    return toSummary(row)
  })

export const create = authedProcedure
  .input(createDeploymentInputSchema)
  .handler(async ({ context, input }) => {
    await assertProjectOwner(input.projectId, context.session!.user.id)
    return runProductionDeploy({
      projectId: input.projectId,
      nodeId: input.nodeId,
      serviceName: input.serviceName,
      image: input.image,
      sourcePath: input.sourcePath,
      triggeredBy: input.triggeredBy,
      options: input.options,
    })
  })

export const logs = authedProcedure
  .input(
    z.object({
      projectId: z.string().min(1),
      serviceName: z.string().min(1),
      nodeId: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }) => {
    await assertProjectOwner(input.projectId, context.session!.user.id)
    const text = await dockerNodeExecutor.getLogs(
      input.nodeId,
      input.serviceName,
    )
    return { logs: text }
  })

export const stop = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const [row] = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, input.id))
    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Deployment not found" })
    }
    await assertProjectOwner(row.projectId, context.session!.user.id)
    await dockerNodeExecutor.stopApp(row.nodeId, row.serviceName)
    // Drop proxy route so Host no longer reverse_proxies a dead upstream
    await proxyService.removeProjectRoute(row.projectId).catch(() => undefined)
    await db
      .update(projects)
      .set({ publicUrl: null })
      .where(eq(projects.id, row.projectId))
    await db
      .update(deployments)
      .set({ status: "stopped" })
      .where(eq(deployments.id, row.id))
    return { ok: true as const }
  })

export const retry = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const [row] = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, input.id))
    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Deployment not found" })
    }
    await assertProjectOwner(row.projectId, context.session!.user.id)
    return runProductionDeploy({
      projectId: row.projectId,
      nodeId: row.nodeId,
      serviceName: row.serviceName,
      image: row.sourcePath ? undefined : (row.image ?? undefined),
      sourcePath: row.sourcePath ?? undefined,
      triggeredBy: "retry",
      options: {
        image: row.sourcePath ? undefined : (row.image ?? undefined),
      },
    })
  })

export const rollback = authedProcedure
  .input(
    z.object({
      projectId: z.string().min(1),
      deploymentId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const project = await assertProjectOwner(
      input.projectId,
      context.session!.user.id,
    )
    const rows = await db
      .select()
      .from(deployments)
      .where(eq(deployments.projectId, input.projectId))
      .orderBy(desc(deployments.createdAt))

    let target = input.deploymentId
      ? rows.find((r) => r.id === input.deploymentId)
      : undefined

    if (!target) {
      const withImage = rows.filter((r) => r.image && r.status === "running")
      target =
        withImage.length >= 2
          ? withImage[1]
          : rows.find((r) => r.image && r.status !== "failed")
    }

    if (!target?.image) {
      throw new ORPCError("BAD_REQUEST", {
        message: "No previous deployment image available to roll back to",
      })
    }

    const nodeId =
      target.nodeId || project.nodeId || (await ensureLocalNodeId())

    return runProductionDeploy({
      projectId: input.projectId,
      nodeId,
      serviceName: target.serviceName || "app",
      image: target.image,
      triggeredBy: "rollback",
      options: { image: target.image },
    })
  })
