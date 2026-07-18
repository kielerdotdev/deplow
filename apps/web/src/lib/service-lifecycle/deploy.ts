/**
 * Deploy orchestration — prebuilt image or git → registry → k3s.
 */

import { and, desc, eq, db, deployments, projects, services } from "@hostrig/db"
import {
  createOperation,
  markOperationQueued,
  selectBuildStrategy,
  type BuildStrategyOverride,
} from "@/lib/core"
import { isBuildRegistryConfigured } from "@/lib/k8s/build"
import { requireConnectedKubeconfig } from "@/lib/k8s/cluster-store"
import { plannedRegistryImage, runK8sDeploy } from "@/lib/k8s/run-deploy"
import { buildServiceDeployEnv } from "./env"
import { transitionService } from "./transition"

export type DeployServiceInput = {
  serviceId: string
  nodeId?: string | null
  image?: string
  sourcePath?: string
  fromGit?: boolean
  triggeredBy?: string
  options?: {
    env?: Record<string, string>
    containerPort?: number
    image?: string
  }
}

export class ServiceLifecycleError extends Error {
  constructor(
    message: string,
    readonly code: "BAD_REQUEST" | "NOT_FOUND" = "BAD_REQUEST",
  ) {
    super(message)
    this.name = "ServiceLifecycleError"
  }
}

async function resolveDeployImage(
  service: typeof services.$inferSelect,
  input: DeployServiceInput,
): Promise<string | null> {
  const explicit = input.image ?? input.options?.image
  if (explicit?.trim()) return explicit.trim()
  if (service.image?.trim()) return service.image.trim()

  const [last] = await db
    .select({ image: deployments.image })
    .from(deployments)
    .where(
      and(
        eq(deployments.serviceId, service.id),
        eq(deployments.status, "running"),
      ),
    )
    .orderBy(desc(deployments.createdAt))
    .limit(1)
  if (last?.image?.trim()) return last.image.trim()

  const [any] = await db
    .select({ image: deployments.image })
    .from(deployments)
    .where(eq(deployments.serviceId, service.id))
    .orderBy(desc(deployments.createdAt))
    .limit(1)
  return any?.image?.trim() || null
}

export async function deployService(input: DeployServiceInput) {
  const [service] = await db
    .select()
    .from(services)
    .where(eq(services.id, input.serviceId))
    .limit(1)
  if (!service) {
    throw new ServiceLifecycleError("Service not found", "NOT_FOUND")
  }
  if (service.type !== "web" && service.type !== "worker") {
    throw new ServiceLifecycleError("Only web and worker services can be deployed")
  }
  if (input.fromGit && !service.gitRepoUrl) {
    throw new ServiceLifecycleError(
      "Connect a Git repository before deploying this service",
    )
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, service.projectId))
    .limit(1)
  if (!project) {
    throw new ServiceLifecycleError("Project not found", "NOT_FOUND")
  }

  try {
    await requireConnectedKubeconfig()
  } catch (e) {
    throw new ServiceLifecycleError(
      e instanceof Error
        ? e.message
        : "Connect a k3s cluster under Settings → Cluster before deploying.",
    )
  }

  const resolvedImage = await resolveDeployImage(service, input)
  // Prefer building from git when the operator asked for fromGit, even if a
  // stale image is on the service row — unless they also passed an explicit image.
  const explicitImage = Boolean(
    (input.image ?? input.options?.image)?.trim(),
  )
  const buildFromGit = Boolean(
    service.gitRepoUrl &&
      (input.fromGit || !resolvedImage) &&
      !explicitImage,
  )

  if (!resolvedImage && !buildFromGit) {
    throw new ServiceLifecycleError(
      "Deploy requires a container image or a connected Git repo. " +
        "Connect Git and add a registry under Settings → Registries, or paste an image on the service.",
    )
  }

  if (buildFromGit && !(await isBuildRegistryConfigured())) {
    throw new ServiceLifecycleError(
      "Git deploy builds an image and pushes it for k3s to pull. " +
        "Add a registry under Settings → Registries and mark it as the build default. " +
        "Or deploy a prebuilt image instead.",
    )
  }

  if (service.status === "deploying" || service.status === "destroying") {
    throw new ServiceLifecycleError(
      `Service is already ${service.status}; wait for the current operation to finish`,
    )
  }

  const id = crypto.randomUUID()
  const plannedImage =
    resolvedImage && !buildFromGit
      ? resolvedImage
      : await plannedRegistryImage({
          projectSlug: project.slug,
          serviceName: service.name,
          deploymentId: id,
        })

  let strategy = buildFromGit ? "railpack" : "image"
  if (!buildFromGit && resolvedImage) {
    try {
      strategy = selectBuildStrategy({
        image: resolvedImage,
        sourcePath: input.sourcePath,
        strategyOverride:
          (service.buildStrategyOverride as BuildStrategyOverride) || undefined,
        dockerfilePath: service.dockerfilePath,
      })
    } catch {
      strategy = "image"
    }
  }
  if (service.buildStrategyOverride === "dockerfile") {
    strategy = "dockerfile"
  } else if (service.buildStrategyOverride === "railpack") {
    strategy = "railpack"
  }

  const operation = await createOperation({
    projectId: project.id,
    serviceId: service.id,
    type: "deploy",
    triggeredBy: input.triggeredBy ?? "manual",
    input: {
      fromGit: input.fromGit || buildFromGit,
      buildFromGit,
      image: plannedImage,
      sourcePath: input.sourcePath,
    },
    stage: "queued",
  })

  await db.insert(deployments).values({
    id,
    serviceId: service.id,
    projectId: project.id,
    nodeId: project.nodeId ?? "k3s-cluster",
    operationId: operation.id,
    serviceName: service.name,
    image: plannedImage,
    sourcePath: input.sourcePath ?? null,
    buildStrategy: strategy,
    status: "queued",
    triggeredBy: input.triggeredBy ?? "manual",
    gitBranch: service.gitBranch || null,
  })

  await transitionService(service.id, "deploying", {
    errorMessage: null,
    errorCode: null,
    lastOperationId: operation.id,
  })
  await markOperationQueued(operation.id)

  const containerPort =
    input.options?.containerPort ?? service.containerPort ?? 80
  const env = await buildServiceDeployEnv({
    serviceId: service.id,
    projectId: project.id,
    projectName: project.name,
    serviceName: service.name,
    serviceType: service.type,
    containerPort,
    envJson: service.envJson,
    extraEnv: input.options?.env,
  })

  void runK8sDeploy({
    operationId: operation.id,
    deploymentId: id,
    serviceId: service.id,
    projectSlug: project.slug,
    serviceName: service.name,
    serviceType: service.type === "worker" ? "worker" : "web",
    image: buildFromGit ? null : resolvedImage,
    buildFromGit,
    containerPort,
    env,
    isPrimary: Boolean(service.isPrimary),
  })

  const [row] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, id))
  return {
    id: row!.id,
    serviceId: row!.serviceId,
    projectId: row!.projectId,
    nodeId: row!.nodeId,
    operationId: row!.operationId,
    serviceName: row!.serviceName,
    image: row!.image,
    buildStrategy: row!.buildStrategy,
    buildLogs: row!.buildLogs,
    sourcePath: row!.sourcePath,
    gitSha: row!.gitSha,
    gitBranch: row!.gitBranch,
    failedStage: row!.failedStage,
    status: row!.status,
    containerId: row!.containerId,
    errorMessage: row!.errorMessage,
    triggeredBy: row!.triggeredBy,
    createdAt: row!.createdAt.toISOString(),
    updatedAt: row!.updatedAt.toISOString(),
    operation: {
      id: operation.id,
      status: "queued" as const,
    },
  }
}
