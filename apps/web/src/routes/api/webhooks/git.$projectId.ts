import { createFileRoute } from "@tanstack/react-router"
import { eq } from "@deplow/db"

import {
  decryptString,
  gitWebhookResultToResponse,
  handleGitWebhook,
  isWebhookBodyTooLarge,
  MAX_WEBHOOK_BODY_BYTES,
  type GitWebhookProject,
} from "@/lib/core"
import { db, gitService, platformConfig, projects } from "@/lib/services"
import { runProductionDeploy } from "@/orpc/deployments"

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

        if (isWebhookBodyTooLarge(Buffer.byteLength(rawBody, "utf8"))) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: `Webhook body too large (max ${MAX_WEBHOOK_BODY_BYTES} bytes)`,
            }),
            {
              status: 413,
              headers: { "Content-Type": "application/json" },
            },
          )
        }

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

/** Clone → shared production deploy pipeline (locked, proxy, gVisor). */
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

  const summary = await runProductionDeploy({
    projectId: project.id,
    nodeId: project.nodeId,
    serviceName: "app",
    sourcePath: clone.sourcePath,
    triggeredBy: "git_webhook",
  })

  return { deploymentId: summary.id, status: summary.status }
}
