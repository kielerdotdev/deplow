import { ORPCError } from "@orpc/server"
import * as z from "zod"

import { eq } from "@deplow/db"
import { createDeploymentInputSchema } from "@deplow/shared"

import {
  buildService,
  db,
  decryptProjectCredentials,
  deployments,
  dockerNodeExecutor,
  nodes,
  platformConfig,
  projects,
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
    createdAt: row.createdAt.toISOString(),
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
    return rows.map(toSummary)
  })

export const create = authedProcedure
  .input(createDeploymentInputSchema)
  .handler(async ({ context, input }) => {
    const ownerId = context.session!.user.id
    const project = await assertProjectOwner(input.projectId, ownerId)
    const [node] = await db
      .select()
      .from(nodes)
      .where(eq(nodes.id, input.nodeId))
    if (!node) {
      throw new ORPCError("NOT_FOUND", { message: "Node not found" })
    }
    if (node.provider !== "docker") {
      throw new ORPCError("BAD_REQUEST", {
        message: "Only docker nodes are supported",
      })
    }

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
      nodeId: input.nodeId,
      serviceName: input.serviceName,
      image: imageInput,
      sourcePath: sourcePath ?? null,
      buildStrategy: strategy,
      dockerCompose: null,
      status: strategy === "image" ? "pending" : "building",
    })

    let buildLogs = ""
    let image = imageInput

    try {
      if (strategy === "dockerfile" || strategy === "railpack") {
        if (!sourcePath) {
          throw new Error("sourcePath required for source builds")
        }
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
            status: "pending",
          })
          .where(eq(deployments.id, id))
      }

      if (!image) {
        throw new Error("No image resolved for deploy")
      }

      const result = await dockerNodeExecutor.deployApp(input.nodeId, {
        image,
        serviceName: input.serviceName,
        env,
        publishPort: input.options?.publishPort,
        containerPort: input.options?.containerPort,
        projectId: input.projectId,
        command: input.options?.command,
        entrypoint: input.options?.entrypoint,
      })
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
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message })
    }
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
  .input(
    z.object({
      id: z.string().min(1),
    }),
  )
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
    await db
      .update(deployments)
      .set({ status: "stopped" })
      .where(eq(deployments.id, row.id))
    return { ok: true as const }
  })

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
