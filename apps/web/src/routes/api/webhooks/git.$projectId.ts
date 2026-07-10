import { createFileRoute } from "@tanstack/react-router"
import { eq } from "@deplow/db"

import {
  decryptString,
  extractPushBranch,
  selectBuildStrategy,
  verifyWebhookSignature,
  type GitProvider,
  injectDeployEnv,
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
 * Verifies signatures before any clone/build work.
 */
export const Route = createFileRoute("/api/webhooks/git/$projectId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const projectId = params.projectId
        const rawBody = await request.text()

        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))

        if (!project || !project.gitWebhookSecretEncrypted) {
          return json(
            { ok: false, error: "Unknown project or git not connected" },
            404,
          )
        }

        const secret = decryptString(
          project.gitWebhookSecretEncrypted,
          platformConfig.secretsEncryptionKey,
        )

        const provider = (project.gitProvider as GitProvider) || "github"
        const githubSignature = request.headers.get("x-hub-signature-256")
        const gitlabToken = request.headers.get("x-gitlab-token")

        const valid = verifyWebhookSignature({
          provider,
          rawBody,
          secret,
          githubSignature,
          gitlabToken,
        })

        if (!valid) {
          await db
            .update(projects)
            .set({
              gitLastDeliveryAt: new Date(),
              gitLastDeliveryStatus: "rejected",
              gitLastDeliveryError: "Invalid webhook signature",
            })
            .where(eq(projects.id, projectId))
          return json({ ok: false, error: "Invalid signature" }, 401)
        }

        let payload: unknown
        try {
          payload = JSON.parse(rawBody)
        } catch {
          return json({ ok: false, error: "Invalid JSON body" }, 400)
        }

        const branch = extractPushBranch(provider, payload)
        const expected = project.gitBranch || "main"
        if (!branch) {
          // Non-push events (ping, etc.) — accept without deploy
          await db
            .update(projects)
            .set({
              gitLastDeliveryAt: new Date(),
              gitLastDeliveryStatus: "ignored",
              gitLastDeliveryError: "Not a push event",
            })
            .where(eq(projects.id, projectId))
          return json({ ok: true, ignored: true, reason: "not a push" })
        }

        if (branch !== expected) {
          await db
            .update(projects)
            .set({
              gitLastDeliveryAt: new Date(),
              gitLastDeliveryStatus: "ignored",
              gitLastDeliveryError: `Branch ${branch} ≠ ${expected}`,
            })
            .where(eq(projects.id, projectId))
          return json({
            ok: true,
            ignored: true,
            reason: `branch ${branch} does not match production branch ${expected}`,
          })
        }

        if (!project.gitRepoUrl) {
          return json({ ok: false, error: "No repo URL configured" }, 400)
        }

        // Production deploy pipeline
        try {
          const clone = await gitService.syncRepo({
            projectId,
            repoUrl: project.gitRepoUrl,
            branch: expected,
          })

          let nodeId = project.nodeId
          if (!nodeId) {
            nodeId = await ensureLocalNodeId()
            await db
              .update(projects)
              .set({ nodeId })
              .where(eq(projects.id, projectId))
          }

          const strategy = selectBuildStrategy({ sourcePath: clone.sourcePath })
          const deploymentId = crypto.randomUUID()
          const serviceName = "app"

          await db.insert(deployments).values({
            id: deploymentId,
            projectId,
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

          const credentials = decryptProjectCredentials(
            project.credentialsEncrypted,
          )
          const env = credentials
            ? injectDeployEnv(credentials, platformConfig)
            : {}

          const containerPort = 80
          const result = await dockerNodeExecutor.deployApp(nodeId, {
            image: built.image,
            serviceName,
            env,
            containerPort,
            projectId,
          })

          const upstream = dockerNodeExecutor.proxyUpstream(
            nodeId,
            serviceName,
            containerPort,
          )
          const route = await proxyService.upsertProductionRoute({
            projectId,
            slug: project.slug,
            upstream,
          })
          if (route.publicUrl) {
            await db
              .update(projects)
              .set({ publicUrl: route.publicUrl })
              .where(eq(projects.id, projectId))
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

          await db
            .update(projects)
            .set({
              gitLastDeliveryAt: new Date(),
              gitLastDeliveryStatus: "success",
              gitLastDeliveryError: null,
            })
            .where(eq(projects.id, projectId))

          return json({
            ok: true,
            deploymentId,
            status: "running",
            branch,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await db
            .update(projects)
            .set({
              gitLastDeliveryAt: new Date(),
              gitLastDeliveryStatus: "failed",
              gitLastDeliveryError: message,
            })
            .where(eq(projects.id, projectId))
          return json({ ok: false, error: message }, 500)
        }
      },
    },
  },
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
