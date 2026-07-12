import { existsSync } from "node:fs"
import path from "node:path"

import { eq } from "@deplow/db"

import {
  containerRuntimeEnv,
  injectDeployEnv,
  injectDeployEnvFromBindings,
  selectBuildStrategy,
  waitForServiceHealth,
  type BuildStrategyOverride,
} from "@/lib/core"
import {
  markOperationFailed,
  markOperationRunning,
  markOperationSucceeded,
  updateOperationStage,
} from "@/lib/core/queue/operations"
import type { DeployJobData } from "@/lib/core/queue"
import {
  buildService,
  db,
  deployments,
  dockerNodeExecutor,
  getProjectCredentials,
  getServiceDeployEnv,
  gitService,
  platformConfig,
  projects,
  proxyService,
  services,
} from "@/lib/services"
import {
  listActiveHostnames,
  upsertAutoHostname,
} from "@/lib/service-hostnames"

export async function processDeployJob(data: DeployJobData): Promise<void> {
  const { operationId, deploymentId, serviceId } = data
  await markOperationRunning(operationId, "queued")

  const [service] = await db
    .select()
    .from(services)
    .where(eq(services.id, serviceId))
  const [project] = service
    ? await db.select().from(projects).where(eq(projects.id, service.projectId))
    : [undefined]
  const [deployment] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, deploymentId))

  if (!service || !project || !deployment) {
    await markOperationFailed(operationId, {
      message: "Service or deployment not found",
      code: "not_found",
    })
    return
  }

  let image = data.image ?? deployment.image ?? undefined
  let sourcePath = data.sourcePath ?? deployment.sourcePath ?? undefined
  let buildLogs = deployment.buildLogs ?? ""
  let stage = "queued"
  let gitSha: string | null = null

  try {
    if (data.fromGit) {
      stage = "analyzing"
      await updateOperationStage(operationId, stage)
      await db
        .update(deployments)
        .set({ status: "analyzing", gitBranch: service.gitBranch || "main" })
        .where(eq(deployments.id, deploymentId))

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
      gitSha = clone.commitSha ?? null
      await db
        .update(deployments)
        .set({ buildLogs: buildLogs || null, gitSha })
        .where(eq(deployments.id, deploymentId))

      validateDeploySource({
        sourcePath,
        rootDirectory: service.rootDirectory,
        dockerfilePath: service.dockerfilePath,
        strategyOverride: service.buildStrategyOverride,
        startCommand: service.startCommand,
      })
    }

    const strategyOverride =
      (service.buildStrategyOverride as BuildStrategyOverride | null) ||
      undefined

    const strategy = selectBuildStrategy({
      image,
      sourcePath,
      strategyOverride,
      dockerfilePath: service.dockerfilePath,
    })
    if (strategy !== "image") {
      if (!sourcePath) throw new Error("Source path is required")
      stage = "building"
      await updateOperationStage(operationId, stage)
      await db
        .update(deployments)
        .set({
          status: "building",
          sourcePath,
          buildLogs: buildLogs || null,
          gitSha,
        })
        .where(eq(deployments.id, deploymentId))

      let dirty = false
      let streamed = false
      const flushLogs = () => {
        if (!dirty) return
        dirty = false
        const snapshot = buildLogs
        void db
          .update(deployments)
          .set({ buildLogs: snapshot || null })
          .where(eq(deployments.id, deploymentId))
          .catch(() => undefined)
      }
      const flushTimer = setInterval(flushLogs, 400)

      try {
        const built = await buildService.buildFromSource({
          sourcePath,
          projectSlug: `${project.slug}-${service.name}`,
          deploymentId,
          rootDirectory: service.rootDirectory,
          dockerfilePath: service.dockerfilePath,
          strategyOverride,
          buildCommand: service.buildCommand,
          startCommand: service.startCommand,
          onLog: (chunk) => {
            streamed = true
            buildLogs = `${buildLogs}${chunk}`
            dirty = true
          },
        })
        image = built.image
        if (!streamed) {
          buildLogs = [buildLogs, built.logs].filter(Boolean).join("\n")
        }
      } finally {
        clearInterval(flushTimer)
        flushLogs()
      }
    }
    if (!image) throw new Error("No image resolved for deploy")

    stage = "deploying"
    await updateOperationStage(operationId, stage)
    await db
      .update(deployments)
      .set({ status: "deploying", image, buildLogs: buildLogs || null, gitSha })
      .where(eq(deployments.id, deploymentId))

    const serviceEnv = service.envJson
      ? (JSON.parse(service.envJson) as Record<string, string>)
      : {}
    const containerPort =
      (data.options?.containerPort as number | undefined) ??
      service.containerPort

    const bindingEnv = await getServiceDeployEnv(service.id)
    const credentials = bindingEnv
      ? null
      : await getProjectCredentials(project.id)

    const baseExtra = {
      ...serviceEnv,
      ...((data.options?.env as Record<string, string> | undefined) ?? {}),
      SERVICE_NAME: service.name,
      PROJECT_NAME: project.name,
      ...(service.type === "web"
        ? { PORT: String(containerPort), HOST: "0.0.0.0" }
        : {}),
    }

    const env = bindingEnv
      ? injectDeployEnvFromBindings(bindingEnv, platformConfig, baseExtra)
      : credentials
        ? injectDeployEnv(credentials, platformConfig, baseExtra)
        : containerRuntimeEnv(baseExtra)

    const result = await dockerNodeExecutor.deployApp(deployment.nodeId, {
      image,
      serviceName: service.slug,
      env,
      publishPort:
        service.type === "web"
          ? (data.options?.publishPort as number | undefined)
          : undefined,
      containerPort,
      projectId: project.id,
      serviceId: service.id,
      serviceType: service.type === "worker" ? "worker" : "web",
      command: data.options?.command as string[] | undefined,
      entrypoint: data.options?.entrypoint as string[] | undefined,
      readOnlyRootfs: data.options?.readOnlyRootfs as boolean | undefined,
    })

    stage = "checking"
    await updateOperationStage(operationId, stage)
    await db
      .update(deployments)
      .set({
        status: "checking",
        containerId: result.containerId,
        image,
        buildStrategy: strategy,
        buildLogs: buildLogs || null,
        gitSha,
      })
      .where(eq(deployments.id, deploymentId))

    const runtimeLogs = await dockerNodeExecutor
      .getLogs(deployment.nodeId, service.slug)
      .catch(() => "")

    const health = await waitForServiceHealth({
      serviceType: service.type === "worker" ? "worker" : "web",
      expectedPort: containerPort,
      healthCheckPath: service.healthCheckPath,
      logs: runtimeLogs,
      isPortListening: () =>
        dockerNodeExecutor.isPortListening(
          deployment.nodeId,
          service.slug,
          containerPort,
        ),
      httpGet: service.healthCheckPath
        ? (p) =>
            dockerNodeExecutor.httpGetInService(
              deployment.nodeId,
              service.slug,
              containerPort,
              p,
            )
        : undefined,
      isProcessStable: async () => {
        const state = await dockerNodeExecutor.getContainerState(
          deployment.nodeId,
          service.slug,
        )
        return state.running && state.restartCount < 3
      },
    })

    if (!health.ok) {
      const rootCause = extractRootCause(runtimeLogs, buildLogs)
      const err = new Error(health.message) as Error & {
        symptom?: string
        rootCause?: string
      }
      err.symptom = health.message
      err.rootCause = rootCause
      throw err
    }

    let publicUrl: string | null = null
    if (service.type === "web") {
      const auto = await upsertAutoHostname({
        serviceId: service.id,
        projectSlug: project.slug,
        serviceName: service.name,
        isPrimary: service.isPrimary,
        proxy: proxyService,
      })
      const hostnames = await listActiveHostnames(service.id)
      const upstream = dockerNodeExecutor.proxyUpstream(
        deployment.nodeId,
        service.slug,
        containerPort,
      )
      if (hostnames.length > 0) {
        const route = await proxyService.upsertServiceRoute({
          serviceId: service.id,
          projectSlug: project.slug,
          serviceName: service.name,
          isPrimary: service.isPrimary,
          upstream,
          hostnames,
        })
        publicUrl = auto.publicUrl ?? route.publicUrl
      } else {
        await proxyService.removeServiceRoute(service.id).catch(() => undefined)
        publicUrl = null
      }
    }

    await db
      .update(deployments)
      .set({
        status: "running",
        containerId: result.containerId,
        image,
        buildStrategy: strategy,
        buildLogs: buildLogs || null,
        gitSha,
        errorMessage: null,
        failedStage: null,
      })
      .where(eq(deployments.id, deploymentId))
    await db
      .update(services)
      .set({
        status: "running",
        containerId: result.containerId,
        image,
        publicUrl,
        errorMessage: null,
        errorCode: null,
        lastOperationId: operationId,
        ...(deployment.triggeredBy === "git_webhook"
          ? {
              gitLastDeliveryAt: new Date(),
              gitLastDeliveryStatus: "success",
              gitLastDeliveryError: null,
            }
          : {}),
      })
      .where(eq(services.id, service.id))
    await markOperationSucceeded(operationId, {
      deploymentId,
      containerId: result.containerId,
      publicUrl,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const symptom =
      error && typeof error === "object" && "symptom" in error
        ? String((error as { symptom?: string }).symptom ?? message)
        : message
    const rootCause =
      error && typeof error === "object" && "rootCause" in error
        ? String(
            (error as { rootCause?: string }).rootCause ??
              extractRootCause("", buildLogs) ??
              message,
          )
        : extractRootCause("", buildLogs) || message

    await db
      .update(deployments)
      .set({
        status: "failed",
        errorMessage: message,
        buildLogs: buildLogs || message,
        failedStage: stage,
        gitSha,
      })
      .where(eq(deployments.id, deploymentId))
    await db
      .update(services)
      .set({
        status: "error",
        errorMessage: rootCause || message,
        errorCode: "deploy_failed",
        lastOperationId: operationId,
        ...(deployment.triggeredBy === "git_webhook"
          ? {
              gitLastDeliveryAt: new Date(),
              gitLastDeliveryStatus: "failed",
              gitLastDeliveryError: rootCause || message,
            }
          : {}),
      })
      .where(eq(services.id, service.id))
    await markOperationFailed(operationId, {
      message,
      code: "deploy_failed",
      rootCause,
      symptom,
      stage,
      logs: buildLogs || message,
    })
  }
}

function extractRootCause(runtimeLogs: string, buildLogs: string): string {
  const combined = [runtimeLogs, buildLogs].filter(Boolean).join("\n")
  const lines = combined
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  const interesting = lines.filter((l) =>
    /error|exception|fatal|cannot|failed|enoent|eaddrinuse/i.test(l),
  )
  if (interesting.length > 0) {
    return interesting.slice(-5).join("\n")
  }
  return lines.slice(-8).join("\n") || ""
}

function validateDeploySource(input: {
  sourcePath: string
  rootDirectory: string | null
  dockerfilePath: string | null
  strategyOverride: string | null
  startCommand: string | null
}): void {
  const root = input.rootDirectory?.trim() || "."
  const context =
    root === "." ? input.sourcePath : path.join(input.sourcePath, root)
  if (!existsSync(context)) {
    throw new Error(`Root directory does not exist: ${root}`)
  }
  if (input.dockerfilePath) {
    const candidates = [
      path.join(input.sourcePath, input.dockerfilePath),
      path.join(context, input.dockerfilePath),
      path.join(context, path.basename(input.dockerfilePath)),
    ]
    if (!candidates.some((p) => existsSync(p))) {
      throw new Error(`Dockerfile not found at ${input.dockerfilePath}`)
    }
  }
  const override = input.strategyOverride || "auto"
  if (override === "railpack" && !input.startCommand?.trim()) {
    throw new Error("No start command detected.")
  }
}
