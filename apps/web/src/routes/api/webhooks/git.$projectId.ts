import { createFileRoute } from "@tanstack/react-router"
import { eq } from "@deplow/db"

import {
  decryptString,
  gitWebhookResultToResponse,
  handleGitWebhook,
  injectDeployEnv,
  selectBuildStrategy,
  type GitWebhookProject,
} from "@/lib/core"
import {
  buildService,
  db,
  decryptProjectCredentials,
  deployments,
  dockerNodeExecutor,
  ensureLocalNodeId,
  gitService,
  platformConfig,
  projects,
  proxyService,
} from "@/lib/services"

/**
 * GitHub / GitLab push webhook → production deploy.
 * Verifies signatures before any clone/build work (see handleGitWebhook).
 */
export const Route = createFileRoute("/api/webhooks/git/$projectId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const projectId = params.projectId
        const rawBody = await request.text()

        const result = await handleGitWebhook(
          {
            projectId,
            rawBody,
            headers: {
              "x-hub-signature-256": request.headers.get("x-hub-signature-256"),
              "x-gitlab-token": request.headers.get("x-gitlab-token"),
            },
          },
          {
            loadProject: async (id) => {
              const [row] = await db
                .select()
                .from(projects)
                .where(eq(projects.id, id))
              if (!row) return null
              return rowToWebhookProject(row)
            },
            decryptSecret: (encrypted) =>
              decryptString(encrypted, platformConfig.secretsEncryptionKey),
            recordDelivery: async ({ projectId: pid, status, error }) => {
              await db
                .update(projects)
                .set({
                  gitLastDeliveryAt: new Date(),
                  gitLastDeliveryStatus: status,
                  gitLastDeliveryError: error ?? null,
                })
                .where(eq(projects.id, pid))
            },
            runProductionDeployFromGit: async ({ project, branch }) => {
              return runGitProductionDeploy(project, branch)
            },
          },
        )

        return gitWebhookResultToResponse(result)
      },
    },
  },
})

function rowToWebhookProject(
  row: typeof projects.$inferSelect,
): GitWebhookProject {
  return {
    id: row.id,
    slug: row.slug,
    nodeId: row.nodeId,
    gitProvider: row.gitProvider,
    gitRepoUrl: row.gitRepoUrl,
    gitBranch: row.gitBranch,
    gitWebhookSecretEncrypted: row.gitWebhookSecretEncrypted,
    credentialsEncrypted: row.credentialsEncrypted,
  }
}

/** Clone → build → deploy production slot → update proxy. */
async function runGitProductionDeploy(
  project: GitWebhookProject,
  branch: string,
): Promise<{ deploymentId: string; status: string }> {
  if (!project.gitRepoUrl) {
    throw new Error("No repo URL configured")
  }

  const clone = await gitService.syncRepo({
    projectId: project.id,
    repoUrl: project.gitRepoUrl,
    branch,
  })

  let nodeId = project.nodeId
  if (!nodeId) {
    nodeId = await ensureLocalNodeId()
    await db.update(projects).set({ nodeId }).where(eq(projects.id, project.id))
  }

  const strategy = selectBuildStrategy({ sourcePath: clone.sourcePath })
  const deploymentId = crypto.randomUUID()
  const serviceName = "app"

  await db.insert(deployments).values({
    id: deploymentId,
    projectId: project.id,
    nodeId,
    serviceName,
    sourcePath: clone.sourcePath,
    buildStrategy: strategy,
    status: "building",
    triggeredBy: "git_webhook",
    buildLogs: clone.logs,
  })

  const built = await buildService.buildFromSource({
    sourcePath: clone.sourcePath,
    projectSlug: project.slug,
    deploymentId,
  })

  await db
    .update(deployments)
    .set({
      image: built.image,
      buildLogs: [clone.logs, built.logs].filter(Boolean).join("\n"),
      buildStrategy: built.strategy,
      status: "deploying",
    })
    .where(eq(deployments.id, deploymentId))

  const credentials = decryptProjectCredentials(project.credentialsEncrypted)
  const env = credentials ? injectDeployEnv(credentials, platformConfig) : {}

  const containerPort = 80
  const result = await dockerNodeExecutor.deployApp(nodeId, {
    image: built.image,
    serviceName,
    env,
    containerPort,
    projectId: project.id,
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
      image: built.image,
      errorMessage: null,
    })
    .where(eq(deployments.id, deploymentId))

  return { deploymentId, status: "running" }
}
