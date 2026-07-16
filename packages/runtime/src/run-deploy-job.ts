import type { AgentDeployJobPayload } from "@deplow/shared"

import { BuildService, selectBuildStrategy } from "./build.service"
import type { RuntimeConfig } from "./config"
import { DockerNodeExecutor } from "./docker-node-executor"
import { GitService } from "./git.service"
import { waitForServiceHealth } from "./health-check"
import { containerRuntimeEnv } from "./inject-env"

export type DeployJobProgress = {
  stage: string
  buildLogs?: string
  message?: string
}

export type DeployJobSuccess = {
  containerId: string
  image: string
  publishedPort?: number
  buildLogs: string
  gitSha: string | null
  buildStrategy: string
}

export type DeployJobFailure = {
  message: string
  code?: string
  stage: string
  buildLogs?: string
}

export type RunDeployJobHandlers = {
  onProgress: (p: DeployJobProgress) => Promise<void> | void
}

/**
 * Execute a full deploy on the local Docker daemon (agent or control-plane runtime).
 * Control plane supplies env + git auth in the payload; this does clone/build/run/health.
 */
export async function runDeployJob(
  config: RuntimeConfig,
  payload: AgentDeployJobPayload,
  handlers: RunDeployJobHandlers,
): Promise<DeployJobSuccess> {
  const executor = new DockerNodeExecutor(config, async (nodeId) => ({
    id: nodeId,
    name: nodeId,
    host: "local",
  }))
  const gitService = new GitService(config.gitCloneRoot)
  const buildService = new BuildService({
    railpackBin: config.railpackBin,
    buildkitHost: config.buildkitHost,
    dockerBin: config.dockerBin,
  })

  let buildLogs = ""
  let stage = "queued"
  let gitSha: string | null = null
  let image = payload.image
  let sourcePath = payload.sourcePath

  const report = async (next: string, extra?: Partial<DeployJobProgress>) => {
    stage = next
    await handlers.onProgress({ stage: next, buildLogs, ...extra })
  }

  try {
    if (payload.fromGit && payload.gitRepoUrl) {
      await report("analyzing")
      const token = payload.gitAuth?.token
      const synced = await gitService.syncRepo({
        projectId: payload.projectId,
        repoUrl: payload.gitRepoUrl,
        branch: payload.gitBranch || "main",
        auth: token
          ? {
              token,
              username: payload.gitAuth?.username,
              provider: payload.gitAuth?.provider,
            }
          : undefined,
      })
      sourcePath = synced.sourcePath
      buildLogs += synced.logs
      gitSha = synced.commitSha ?? null
      await report("analyzing", { buildLogs })
    }

    if (!image) {
      await report("building")
      if (!sourcePath) {
        throw Object.assign(new Error("sourcePath or image required"), {
          code: "bad_request",
        })
      }
      const built = await buildService.buildFromSource({
        sourcePath,
        projectSlug: payload.projectSlug,
        deploymentId: payload.deploymentId,
        rootDirectory: payload.rootDirectory,
        dockerfilePath: payload.dockerfilePath,
        strategyOverride: payload.buildStrategyOverride,
        buildCommand: payload.buildCommand,
        startCommand: payload.startCommand,
        onLog: (chunk) => {
          buildLogs += chunk
        },
      })
      image = built.image
      buildLogs += built.logs
      await report("building", { buildLogs })
    }

    const strategy = selectBuildStrategy({
      image,
      sourcePath,
      strategyOverride: payload.buildStrategyOverride,
      dockerfilePath: payload.dockerfilePath,
    })

    await report("deploying")
    const containerPort =
      payload.options?.containerPort ?? payload.containerPort ?? 80
    const env = containerRuntimeEnv(payload.env ?? {})

    const command = payload.options?.command
    const entrypoint = payload.options?.entrypoint

    const deployed = await executor.deployApp(payload.nodeId, {
      image,
      serviceName: payload.serviceName,
      projectId: payload.projectId,
      serviceId: payload.serviceId,
      serviceType: payload.serviceType,
      containerPort,
      env,
      command,
      entrypoint,
      readOnlyRootfs: payload.options?.readOnlyRootfs,
      publishPort: payload.options?.publishPort,
      publishHostPort: true,
    })

    await report("checking")
    const runtimeLogs = await executor
      .getLogs(payload.nodeId, payload.serviceName)
      .catch(() => "")

    const health = await waitForServiceHealth({
      serviceType: payload.serviceType,
      expectedPort: containerPort,
      healthCheckPath: payload.healthCheckPath,
      logs: runtimeLogs,
      isPortListening: () =>
        executor.isPortListening(
          payload.nodeId,
          payload.serviceName,
          containerPort,
        ),
      httpGet: payload.healthCheckPath
        ? (p) =>
            executor.httpGetInService(
              payload.nodeId,
              payload.serviceName,
              containerPort,
              p,
            )
        : undefined,
      isProcessStable: async () => {
        const state = await executor.getContainerState(
          payload.nodeId,
          payload.serviceName,
        )
        return state.running && state.restartCount < 3
      },
    })

    if (!health.ok) {
      throw Object.assign(new Error(health.message), {
        code: "health_failed",
      })
    }

    await report("running", { buildLogs })
    return {
      containerId: deployed.containerId,
      image: image!,
      publishedPort: deployed.publishedPort,
      buildLogs,
      gitSha,
      buildStrategy: strategy,
    }
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "stage" in error &&
      "message" in error
    ) {
      throw error
    }
    const message = error instanceof Error ? error.message : String(error)
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : undefined
    const failure: DeployJobFailure = {
      message,
      code,
      stage,
      buildLogs,
    }
    throw failure
  }
}

export async function runStopJob(
  config: RuntimeConfig,
  input: { nodeId: string; serviceName: string },
): Promise<void> {
  const executor = new DockerNodeExecutor(config, async (nodeId) => ({
    id: nodeId,
    name: nodeId,
    host: "local",
  }))
  await executor.stopApp(input.nodeId, input.serviceName)
}

export async function runDestroyJob(
  config: RuntimeConfig,
  input: { nodeId: string; serviceName: string; projectId?: string },
): Promise<void> {
  const executor = new DockerNodeExecutor(config, async (nodeId) => ({
    id: nodeId,
    name: nodeId,
    host: "local",
  }))
  await executor.removeApp(input.nodeId, input.serviceName)
  if (input.projectId) {
    await executor.removeProjectContainers(input.projectId)
  }
}

export async function runLogsJob(
  config: RuntimeConfig,
  input: { nodeId: string; serviceName: string },
): Promise<string> {
  const executor = new DockerNodeExecutor(config, async (nodeId) => ({
    id: nodeId,
    name: nodeId,
    host: "local",
  }))
  return executor.getLogs(input.nodeId, input.serviceName)
}
