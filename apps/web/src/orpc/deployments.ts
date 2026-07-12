import { ORPCError } from "@orpc/server"
import * as z from "zod"

import { and, desc, eq, inArray } from "@deplow/db"
import { createDeploymentInputSchema } from "@deplow/shared"

import { assertProjectAccess } from "@/lib/access"
import {
  createOperation,
  enqueueDeploy,
  markOperationQueued,
  selectBuildStrategy,
  type BuildStrategyOverride,
} from "@/lib/core"
import { env } from "@/lib/env"
import type { Session } from "@/lib/auth"
import {
  db,
  deployments,
  dockerNodeExecutor,
  ensureLocalNodeId,
  nodes,
  operations,
  projects,
  proxyService,
  services,
} from "@/lib/services"

import { removeAllHostnames } from "@/lib/service-hostnames"

import { authedProcedure } from "./middleware"

function toSummary(row: typeof deployments.$inferSelect) {
  return {
    id: row.id,
    serviceId: row.serviceId,
    projectId: row.projectId,
    nodeId: row.nodeId,
    operationId: row.operationId,
    serviceName: row.serviceName,
    image: row.image,
    buildStrategy: row.buildStrategy,
    buildLogs: row.buildLogs,
    sourcePath: row.sourcePath,
    gitSha: row.gitSha,
    gitBranch: row.gitBranch,
    failedStage: row.failedStage,
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

async function loadAccessibleService(serviceId: string, session?: Session) {
  const [service] = await db
    .select()
    .from(services)
    .where(eq(services.id, serviceId))
  if (!service) {
    throw new ORPCError("NOT_FOUND", { message: "Service not found" })
  }
  if (session) {
    const project = await assertProjectAccess(service.projectId, session)
    return { service, project }
  }
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, service.projectId))
  if (!project) {
    throw new ORPCError("NOT_FOUND", { message: "Service not found" })
  }
  return { service, project }
}

export async function runServiceDeploy(input: DeployInput) {
  const { service, project } = await loadAccessibleService(input.serviceId)
  if (service.type !== "web" && service.type !== "worker") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Only web and worker services can be deployed",
    })
  }
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
      strategy = selectBuildStrategy({
        image,
        sourcePath: input.sourcePath,
        strategyOverride:
          (service.buildStrategyOverride as BuildStrategyOverride) || undefined,
        dockerfilePath: service.dockerfilePath,
      })
    } catch (error) {
      throw new ORPCError("BAD_REQUEST", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const operation = await createOperation({
    projectId: project.id,
    serviceId: service.id,
    type: "deploy",
    triggeredBy: input.triggeredBy ?? "manual",
    input: {
      fromGit: input.fromGit,
      image,
      sourcePath: input.sourcePath,
    },
    stage: "queued",
  })

  const id = crypto.randomUUID()
  await db.insert(deployments).values({
    id,
    serviceId: service.id,
    projectId: project.id,
    nodeId,
    operationId: operation.id,
    serviceName: service.name,
    image: image ?? null,
    sourcePath: input.sourcePath ?? null,
    buildStrategy: strategy,
    status: "queued",
    triggeredBy: input.triggeredBy ?? "manual",
    gitBranch: service.gitBranch || null,
  })
  await db
    .update(services)
    .set({
      status: "deploying",
      errorMessage: null,
      errorCode: null,
      lastOperationId: operation.id,
    })
    .where(eq(services.id, service.id))

  await markOperationQueued(operation.id)

  const jobData = {
    operationId: operation.id,
    deploymentId: id,
    serviceId: service.id,
    fromGit: input.fromGit,
    image,
    sourcePath: input.sourcePath,
    triggeredBy: input.triggeredBy,
    options: input.options as Record<string, unknown> | undefined,
  }

  if (env.useQueue) {
    try {
      await enqueueDeploy(jobData)
    } catch (error) {
      console.error("[deplow] enqueue deploy failed; running in-process", error)
      const { processDeployJob } = await import(
        "@/lib/core/queue/deploy-processor"
      )
      void processDeployJob(jobData).catch((err) => {
        console.error(`[deplow] service deploy ${id} crashed`, err)
      })
    }
  } else {
    const { processDeployJob } = await import(
      "@/lib/core/queue/deploy-processor"
    )
    void processDeployJob(jobData).catch((error) => {
      console.error(`[deplow] service deploy ${id} crashed`, error)
    })
  }

  const [row] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, id))
  return {
    ...toSummary(row!),
    operation: {
      id: operation.id,
      status: "queued" as const,
    },
  }
}

/** Compatibility export for webhook adapters while they migrate to service terminology. */
export const runProductionDeploy = runServiceDeploy

export const list = authedProcedure
  .input(
    z.object({
      projectId: z.string().min(1).optional(),
      serviceId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    if (input.serviceId) {
      await loadAccessibleService(input.serviceId, context.session!)
    } else if (input.projectId) {
      await assertProjectAccess(input.projectId, context.session!)
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
    await loadAccessibleService(row.serviceId, context.session!)

    let failure: {
      stage: string | null
      rootCause: string | null
      symptom: string | null
    } | null = null
    if (row.status === "failed" && row.operationId) {
      const [op] = await db
        .select()
        .from(operations)
        .where(eq(operations.id, row.operationId))
      if (op) {
        failure = {
          stage: op.stage ?? row.failedStage,
          rootCause: op.rootCause,
          symptom: op.symptom ?? row.errorMessage,
        }
      }
    } else if (row.status === "failed") {
      failure = {
        stage: row.failedStage,
        rootCause: row.errorMessage,
        symptom: row.errorMessage,
      }
    }

    return { ...toSummary(row), failure }
  })

export const create = authedProcedure
  .input(createDeploymentInputSchema)
  .handler(async ({ context, input }) => {
    await loadAccessibleService(input.serviceId, context.session!)
    return runServiceDeploy(input)
  })

export const logs = authedProcedure
  .input(
    z.object({
      serviceId: z.string().min(1),
      deploymentId: z.string().min(1).optional(),
      since: z.string().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const { service, project } = await loadAccessibleService(
      input.serviceId,
      context.session!,
    )

    const activeStatuses = [
      "queued",
      "analyzing",
      "building",
      "deploying",
      "checking",
    ] as const

    let buildLogs: string | null = null
    let deploymentStatus: string | null = null
    let deploymentId = input.deploymentId ?? null

    if (deploymentId) {
      const [dep] = await db
        .select()
        .from(deployments)
        .where(eq(deployments.id, deploymentId))
      if (dep && dep.serviceId === service.id) {
        buildLogs = dep.buildLogs
        deploymentStatus = dep.status
      }
    } else {
      // Prefer an in-progress deploy so Logs doesn't jump to the previous release.
      const [active] = await db
        .select()
        .from(deployments)
        .where(
          and(
            eq(deployments.serviceId, service.id),
            inArray(deployments.status, [...activeStatuses]),
          ),
        )
        .orderBy(desc(deployments.createdAt))
        .limit(1)
      const latest =
        active ??
        (
          await db
            .select()
            .from(deployments)
            .where(eq(deployments.serviceId, service.id))
            .orderBy(desc(deployments.createdAt))
            .limit(1)
        )[0]
      if (latest) {
        deploymentId = latest.id
        buildLogs = latest.buildLogs
        deploymentStatus = latest.status
      }
    }

    const buildPhase =
      deploymentStatus === "queued" ||
      deploymentStatus === "analyzing" ||
      deploymentStatus === "building"

    const runtimeLogs = buildPhase
      ? ""
      : await dockerNodeExecutor
          .getLogs(project.nodeId ?? (await ensureLocalNodeId()), service.slug)
          .catch(() => "")

    const inProgress =
      Boolean(deploymentStatus) &&
      (activeStatuses as readonly string[]).includes(deploymentStatus!)

    const live =
      inProgress ||
      (service.status === "running" && !buildPhase) ||
      service.status === "deploying"

    return {
      serviceId: service.id,
      serviceName: service.name,
      deploymentId,
      deploymentStatus,
      buildLogs,
      logs: runtimeLogs,
      live,
      phase: buildPhase
        ? ("build" as const)
        : deploymentStatus === "deploying" || deploymentStatus === "checking"
          ? ("deploy" as const)
          : ("runtime" as const),
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
    const { service } = await loadAccessibleService(
      row.serviceId,
      context.session!,
    )
    await dockerNodeExecutor.stopApp(row.nodeId, service.slug)
    await proxyService.removeServiceRoute(service.id).catch(() => undefined)
    await removeAllHostnames(service.id).catch(() => undefined)
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
    const { service } = await loadAccessibleService(
      row.serviceId,
      context.session!,
    )
    return runServiceDeploy({
      serviceId: row.serviceId,
      nodeId: row.nodeId,
      image: row.sourcePath ? undefined : (row.image ?? undefined),
      sourcePath: row.sourcePath ?? undefined,
      fromGit: Boolean(service.gitRepoUrl) && !row.sourcePath && !row.image,
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
    await loadAccessibleService(input.serviceId, context.session!)
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
