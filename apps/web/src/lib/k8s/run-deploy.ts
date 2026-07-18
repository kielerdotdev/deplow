import { eq, db, deployments, projects, services } from "@hostrig/db"
import type { BuildStrategyOverride } from "@/lib/core"

import { markPriorDeploymentsStopped } from "@/lib/core/image-retain"
import {
  markOperationFailed,
  markOperationRunning,
  markOperationSucceeded,
} from "@/lib/core/queue/operations"
import { productionHostname } from "@/lib/core/proxy-hostname"
import { runDeployPublishHooks } from "@/lib/deploy/publish-hooks"
import { resolveCloneAuthForProject } from "@/lib/git-auth"
import { loadIngressSettings } from "@/lib/ingress-settings"
import {
  markServiceDeployFailed,
  markServiceDeploySucceeded,
} from "@/lib/service-lifecycle/completion"
import { gitService, proxyService } from "@/lib/services"

import {
  buildAndPushImage,
  ensureRegistryPullSecrets,
  isBuildRegistryConfigured,
  registryImageRef,
  getBuildRegistryConfig,
} from "./build"
import { requireConnectedKubeconfig } from "./cluster-store"
import { resolveK8sPublicHost } from "./public-host"
import { workloadRegistry } from "./workload"

export async function runK8sDeploy(input: {
  operationId: string
  deploymentId: string
  serviceId: string
  projectSlug: string
  serviceName: string
  serviceType: "web" | "worker"
  /** Prebuilt image; omit/empty when buildFromGit is set. */
  image?: string | null
  containerPort: number
  env: Record<string, string>
  isPrimary: boolean
  /** Clone git, build with Railpack/Dockerfile, push to default registry. */
  buildFromGit?: boolean
}): Promise<void> {
  const { operationId, deploymentId } = input
  let buildLogs = ""
  let image = input.image?.trim() || ""

  const appendLog = async (chunk: string) => {
    buildLogs += chunk
    await db
      .update(deployments)
      .set({ buildLogs })
      .where(eq(deployments.id, deploymentId))
      .catch(() => undefined)
  }

  try {
    if (input.buildFromGit) {
      await markOperationRunning(operationId, "building")
      await db
        .update(deployments)
        .set({ status: "building", failedStage: null, errorMessage: null })
        .where(eq(deployments.id, deploymentId))

      image = await buildImageFromGit({
        deploymentId,
        serviceId: input.serviceId,
        projectSlug: input.projectSlug,
        serviceName: input.serviceName,
        onLog: (c) => {
          void appendLog(c)
        },
      })

      await db
        .update(deployments)
        .set({
          image,
          buildLogs,
          status: "deploying",
        })
        .where(eq(deployments.id, deploymentId))
    }

    if (!image) {
      throw new Error(
        "No container image to deploy. Provide an image or enable git build with HOSTRIG_BUILD_REGISTRY.",
      )
    }

    await markOperationRunning(operationId, "deploying")
    const kubeconfigYaml = await requireConnectedKubeconfig()

    // Best-effort: keep Traefik off public NodePorts on every deploy.
    try {
      const { ensureTraefikNotPublic } = await import("./traefik-harden")
      const hardened = await ensureTraefikNotPublic(kubeconfigYaml)
      if (hardened.patched) {
        console.info(`[hostrig] ${hardened.message}`)
      }
    } catch {
      // non-fatal — deploy continues
    }

    // Fail closed if gVisor RuntimeClass is missing (no runc user-app path).
    try {
      const { loadKubeConfig, apiClients } = await import("./client")
      const { ensureAppRuntimeClass } = await import("./runtime-class")
      const { node } = apiClients(loadKubeConfig(kubeconfigYaml))
      await ensureAppRuntimeClass({ node })
    } catch (e) {
      throw e instanceof Error
        ? e
        : new Error("gVisor RuntimeClass is required for user app deploys")
    }

    const pullSecrets = await ensureRegistryPullSecrets({
      kubeconfigYaml,
      projectSlug: input.projectSlug,
    })

    const ingress = await loadIngressSettings()
    const driver = workloadRegistry().require(input.serviceType)
    if (!driver.deploy) {
      throw new Error(`No deploy support for ${input.serviceType}`)
    }

    let hostname: string | null = null
    let publicUrl: string | null = null
    if (
      input.serviceType === "web" &&
      ingress.autoDomainsEnabled &&
      ingress.baseDomain.trim()
    ) {
      const slug = input.isPrimary
        ? input.projectSlug
        : `${input.projectSlug}-${input.serviceName}`
      const resolved = resolveK8sPublicHost({
        slug,
        baseDomain: ingress.baseDomain,
        publicProtocol: ingress.publicProtocol,
        edgeMode: ingress.edgeMode,
      })
      hostname = resolved.hostname
      publicUrl = resolved.publicUrl
      void productionHostname(slug, ingress.baseDomain)
      proxyService.applySettings(ingress)
    }

    const result = await driver.deploy({
      kubeconfigYaml,
      projectSlug: input.projectSlug,
      serviceId: input.serviceId,
      serviceName: input.serviceName,
      image,
      containerPort: input.containerPort,
      env: input.env,
      hostname,
      imagePullSecrets: pullSecrets.length > 0 ? pullSecrets : undefined,
    })

    let edgeNote = ""
    try {
      const published = await runDeployPublishHooks({
        serviceId: input.serviceId,
        projectSlug: input.projectSlug,
        serviceName: input.serviceName,
        isPrimary: input.isPrimary,
        serviceType: input.serviceType,
        kubeconfigYaml,
        skipProxyRoute: true,
      })
      publicUrl = published.publicUrl ?? publicUrl
      edgeNote = published.note
    } catch (edgeErr) {
      // Workload is already live — do not mark the deploy failed for edge-only issues.
      const msg = edgeErr instanceof Error ? edgeErr.message : String(edgeErr)
      edgeNote = `\n[edge] publish failed: ${msg}`
      console.warn(
        `[hostrig] edge publish failed after successful deploy (${input.serviceId}):`,
        msg,
      )
    }

    if (!publicUrl && result.publicHost) {
      publicUrl = `http://${result.publicHost}`
    }

    const finalLogs = [buildLogs, edgeNote].filter(Boolean).join("\n") || null

    await db
      .update(deployments)
      .set({
        status: "running",
        image,
        errorMessage: null,
        failedStage: null,
        buildLogs: finalLogs,
      })
      .where(eq(deployments.id, deploymentId))

    await markServiceDeploySucceeded({
      serviceId: input.serviceId,
      operationId,
      publicUrl,
      image,
    })
    await markPriorDeploymentsStopped({
      serviceId: input.serviceId,
      currentDeploymentId: deploymentId,
    })

    await markOperationSucceeded(operationId, {
      deploymentId,
      publicUrl,
      namespace: result.namespace,
      image,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stage =
      input.buildFromGit && !image
        ? "building"
        : input.buildFromGit && buildLogs && !message.includes("ready")
          ? "building"
          : "deploying"
    await db
      .update(deployments)
      .set({
        status: "failed",
        errorMessage: message,
        failedStage: stage,
        buildLogs: buildLogs || null,
        ...(image ? { image } : {}),
      })
      .where(eq(deployments.id, deploymentId))
    await markServiceDeployFailed({
      serviceId: input.serviceId,
      operationId,
      message,
      code: stage === "building" ? "build_failed" : "deploy_failed",
    })
    await markOperationFailed(operationId, {
      message,
      code: stage === "building" ? "build_failed" : "deploy_failed",
      stage,
    })
  }
}

async function buildImageFromGit(input: {
  deploymentId: string
  serviceId: string
  projectSlug: string
  serviceName: string
  onLog: (chunk: string) => void
}): Promise<string> {
  if (!(await isBuildRegistryConfigured())) {
    throw new Error(
      "Git deploys need a container registry. Add one under Settings → Registries " +
        "and mark it as the build default (or set HOSTRIG_BUILD_REGISTRY to seed on first boot).",
    )
  }

  const [service] = await db
    .select()
    .from(services)
    .where(eq(services.id, input.serviceId))
    .limit(1)
  if (!service?.gitRepoUrl) {
    throw new Error("Service has no git repository connected")
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, service.projectId))
    .limit(1)
  if (!project) {
    throw new Error("Project not found")
  }

  const auth = await resolveCloneAuthForProject({
    gitProvider: service.gitProvider,
    gitRepoUrl: service.gitRepoUrl,
    gitAuthMethod: service.gitAuthMethod,
    gitInstallationId: service.gitInstallationId,
    gitAccessTokenEncrypted: service.gitAccessTokenEncrypted,
    ownerId: project.ownerId,
  })

  input.onLog("=== git clone ===\n")
  const synced = await gitService.syncRepo({
    projectId: `${project.id}-${service.id}`,
    repoUrl: service.gitRepoUrl,
    branch: service.gitBranch || "main",
    auth: auth
      ? {
          token: auth.token,
          username: auth.username,
          provider: service.gitProvider ?? undefined,
        }
      : undefined,
  })
  input.onLog(synced.logs)
  if (synced.commitSha) {
    input.onLog(`commit: ${synced.commitSha}\n`)
    await db
      .update(deployments)
      .set({ gitSha: synced.commitSha })
      .where(eq(deployments.id, input.deploymentId))
  }

  const built = await buildAndPushImage({
    sourcePath: synced.sourcePath,
    projectSlug: input.projectSlug,
    serviceName: input.serviceName,
    deploymentId: input.deploymentId,
    rootDirectory: service.rootDirectory,
    dockerfilePath: service.dockerfilePath,
    strategyOverride:
      (service.buildStrategyOverride as BuildStrategyOverride) || undefined,
    buildCommand: service.buildCommand,
    startCommand: service.startCommand,
    onLog: input.onLog,
  })

  await db
    .update(deployments)
    .set({ buildStrategy: built.strategy })
    .where(eq(deployments.id, input.deploymentId))

  return built.image
}

/** Planned image ref for a git build (shown in queued deployment before build finishes). */
export async function plannedRegistryImage(input: {
  projectSlug: string
  serviceName: string
  deploymentId: string
}): Promise<string | null> {
  const cfg = await getBuildRegistryConfig()
  if (!cfg) return null
  return registryImageRef({
    registry: cfg.registry,
    projectSlug: input.projectSlug,
    serviceName: input.serviceName,
    deploymentId: input.deploymentId,
  })
}
