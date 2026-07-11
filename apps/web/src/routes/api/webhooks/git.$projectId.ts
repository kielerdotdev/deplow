import { createFileRoute } from "@tanstack/react-router"
import { eq } from "@deplow/db"

import {
  decryptString,
  gitWebhookResultToResponse,
  handleGitWebhook,
  type GitWebhookProject,
} from "@/lib/core"
import { db, platformConfig, projects, services } from "@/lib/services"
import { runServiceDeploy } from "@/orpc/deployments"

/**
 * The route filename retains the old parameter for generated-route stability;
 * the value is a service id. New webhook URLs are emitted as /git/{serviceId}.
 */
export const Route = createFileRoute("/api/webhooks/git/$projectId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const serviceId = params.projectId
        const rawBody = await request.text()
        const result = await handleGitWebhook(
          {
            projectId: serviceId,
            rawBody,
            headers: {
              "x-hub-signature-256": request.headers.get("x-hub-signature-256"),
              "x-gitlab-token": request.headers.get("x-gitlab-token"),
            },
          },
          {
            loadProject: loadWebhookService,
            decryptSecret: (encrypted) =>
              decryptString(encrypted, platformConfig.secretsEncryptionKey),
            recordDelivery: async ({ projectId: id, status, error }) => {
              await db
                .update(services)
                .set({
                  gitLastDeliveryAt: new Date(),
                  gitLastDeliveryStatus: status,
                  gitLastDeliveryError: error ?? null,
                })
                .where(eq(services.id, id))
            },
            runProductionDeployFromGit: async ({ project }) => {
              const deployment = await runServiceDeploy({
                serviceId: project.id,
                fromGit: true,
                triggeredBy: "git_webhook",
              })
              return { deploymentId: deployment.id, status: deployment.status }
            },
          },
        )
        return gitWebhookResultToResponse(result)
      },
    },
  },
})

async function loadWebhookService(
  id: string,
): Promise<GitWebhookProject | null> {
  const [service] = await db.select().from(services).where(eq(services.id, id))
  if (!service) return null
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, service.projectId))
  if (!project) return null
  return {
    id: service.id,
    slug: service.slug,
    nodeId: project.nodeId,
    ownerId: project.ownerId,
    gitProvider: service.gitProvider,
    gitRepoUrl: service.gitRepoUrl,
    gitBranch: service.gitBranch,
    gitWebhookSecretEncrypted: service.gitWebhookSecretEncrypted,
    credentialsEncrypted: null,
    gitAuthMethod: service.gitAuthMethod,
    gitInstallationId: service.gitInstallationId,
    gitAccessTokenEncrypted: service.gitAccessTokenEncrypted,
  }
}
