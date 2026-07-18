import { createFileRoute } from "@tanstack/react-router"
import { eq } from "@hostrig/db"

import {
  decryptString,
  gitWebhookResultToResponse,
  handleGitWebhook,
  isWebhookBodyTooLarge,
  MAX_WEBHOOK_BODY_BYTES,
  type GitWebhookService,
} from "@/lib/core"
import {
  clientIpFromRequest,
  consumeRateLimit,
  rateLimitResponse,
} from "@/lib/rate-limit"
import { db, platformConfig, projects, services } from "@/lib/services"
import { runServiceDeploy } from "@/orpc/deployments"

/** Per-service + per-IP caps to limit deploy storms / signature brute force. */
const WEBHOOK_IP_LIMIT = 60
const WEBHOOK_IP_WINDOW_MS = 60_000
const WEBHOOK_SERVICE_LIMIT = 30
const WEBHOOK_SERVICE_WINDOW_MS = 60_000

/**
 * GitHub / GitLab push webhook → production deploy for a service.
 * Verifies signatures before any clone/build work (see handleGitWebhook).
 * Path param is the service id (registered as /api/webhooks/git/{serviceId}).
 */
export const Route = createFileRoute("/api/webhooks/git/$serviceId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const serviceId = params.serviceId
        const ip = clientIpFromRequest(request)
        const ipLimit = consumeRateLimit(
          `git-webhook:ip:${ip}`,
          WEBHOOK_IP_LIMIT,
          WEBHOOK_IP_WINDOW_MS,
        )
        if (!ipLimit.ok) return rateLimitResponse(ipLimit.retryAfterSec)
        const svcLimit = consumeRateLimit(
          `git-webhook:svc:${serviceId}`,
          WEBHOOK_SERVICE_LIMIT,
          WEBHOOK_SERVICE_WINDOW_MS,
        )
        if (!svcLimit.ok) return rateLimitResponse(svcLimit.retryAfterSec)

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
            serviceId,
            rawBody,
            headers: {
              "x-hub-signature-256": request.headers.get("x-hub-signature-256"),
              "x-gitlab-token": request.headers.get("x-gitlab-token"),
            },
          },
          {
            loadService: async (id) => {
              const [row] = await db
                .select()
                .from(services)
                .where(eq(services.id, id))
              if (!row) return null
              const [project] = await db
                .select()
                .from(projects)
                .where(eq(projects.id, row.projectId))
              return rowToWebhookService(row, project?.nodeId ?? null)
            },
            decryptSecret: (encrypted) =>
              decryptString(encrypted, platformConfig.secretsEncryptionKey),
            recordDelivery: async ({ serviceId: sid, status, error }) => {
              await db
                .update(services)
                .set({
                  gitLastDeliveryAt: new Date(),
                  gitLastDeliveryStatus: status,
                  gitLastDeliveryError: error ?? null,
                })
                .where(eq(services.id, sid))
            },
            runServiceDeployFromGit: async ({ service }) => {
              const summary = await runServiceDeploy({
                serviceId: service.id,
                nodeId: service.nodeId,
                fromGit: true,
                triggeredBy: "git_webhook",
              })
              return { deploymentId: summary.id, status: summary.status }
            },
          },
        )

        return gitWebhookResultToResponse(result)
      },
    },
  },
})

function parseWatchPaths(raw: string | null | undefined): string[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const paths = parsed.filter(
      (p): p is string => typeof p === "string" && p.trim().length > 0,
    )
    return paths.length > 0 ? paths : null
  } catch {
    return null
  }
}

function rowToWebhookService(
  row: typeof services.$inferSelect,
  nodeId: string | null,
): GitWebhookService {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    slug: row.slug,
    nodeId,
    gitProvider: row.gitProvider,
    gitRepoUrl: row.gitRepoUrl,
    gitBranch: row.gitBranch,
    gitWebhookSecretEncrypted: row.gitWebhookSecretEncrypted,
    gitWatchPaths: parseWatchPaths(row.gitWatchPaths),
  }
}
