import { ORPCError } from "@orpc/server"
import * as z from "zod"

import { and, desc, eq, inArray } from "@deplow/db"
import { createDeploymentInputSchema } from "@deplow/shared"

import { assertProjectAccess } from "@/lib/access"
import type { Session } from "@/lib/auth"
import {
  deployService,
  ServiceLifecycleError,
  stopService,
} from "@/lib/service-lifecycle"
import {
  db,
  deployments,
  operations,
  projects,
  services,
} from "@/lib/services"

import { authedProcedure } from "./middleware"

function lifecycleError(e: unknown): never {
  if (e instanceof ServiceLifecycleError) {
    throw new ORPCError(e.code, { message: e.message })
  }
  throw e
}

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
  try {
    return await deployService(input)
  } catch (e) {
    lifecycleError(e)
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

    let runtimeLogs = ""
    if (!buildPhase) {
      try {
        const { requireConnectedKubeconfig } = await import(
          "@/lib/k8s/cluster-store"
        )
        const { getPodLogs } = await import("@/lib/k8s/deploy")
        const kubeconfigYaml = await requireConnectedKubeconfig()
        runtimeLogs = await getPodLogs({
          kubeconfigYaml,
          projectSlug: project.slug,
          serviceName: service.name,
        })
      } catch (e) {
        runtimeLogs =
          e instanceof Error
            ? `Failed to load logs: ${e.message}`
            : `Failed to load logs: ${String(e)}`
      }
    }

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
    await loadAccessibleService(row.serviceId, context.session!)
    try {
      return await stopService({
        serviceId: row.serviceId,
        deploymentId: row.id,
      })
    } catch (e) {
      lifecycleError(e)
    }
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
    const { service } = await loadAccessibleService(
      input.serviceId,
      context.session!,
    )
    const rows = await db
      .select()
      .from(deployments)
      .where(eq(deployments.serviceId, input.serviceId))
      .orderBy(desc(deployments.createdAt))
    const { selectRollbackTarget } = await import("@/lib/core/image-retain")
    const target = selectRollbackTarget(rows, {
      deploymentId: input.deploymentId,
      currentImage: service.image,
    })
    if (!target) {
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
