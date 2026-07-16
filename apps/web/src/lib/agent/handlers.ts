import {
  db,
  deployments,
  eq,
  nodes,
  projects,
  services,
} from "@deplow/db"
import {
  agentClaimRequestSchema,
  agentHeartbeatRequestSchema,
  agentJobCompleteSchema,
  agentJobProgressSchema,
  agentJoinRequestSchema,
  type AgentJobComplete,
} from "@deplow/shared"

import {
  markOperationFailed,
  markOperationRunning,
  markOperationSucceeded,
  updateOperationStage,
} from "@/lib/core/queue/operations"
import {
  listActiveHostnames,
  upsertAutoHostname,
} from "@/lib/service-hostnames"
import { proxyService } from "@/lib/services"

import {
  claimNextJob,
  completeJob,
  getJobForNode,
  markJobRunning,
} from "./jobs"
import { redeemJoinToken, resolveNodeFromBearer } from "./tokens"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function error(message: string, status: number) {
  return json({ error: message }, status)
}

async function requireNode(request: Request) {
  return resolveNodeFromBearer(request.headers.get("authorization"))
}

export async function handleAgentJoin(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return error("Invalid JSON", 400)
  }
  const parsed = agentJoinRequestSchema.safeParse(body)
  if (!parsed.success) {
    return error(parsed.error.message, 400)
  }

  const result = await redeemJoinToken(parsed.data)
  if (!result) {
    return error("Invalid or expired join token, or name already taken", 401)
  }
  return json(result)
}

export async function handleAgentHeartbeat(
  request: Request,
): Promise<Response> {
  const node = await requireNode(request)
  if (!node) return error("Unauthorized", 401)

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const parsed = agentHeartbeatRequestSchema.safeParse(body)
  if (!parsed.success) {
    return error(parsed.error.message, 400)
  }

  const now = new Date()
  await db
    .update(nodes)
    .set({
      status: "online",
      lastSeenAt: now,
      advertiseHost: parsed.data.advertiseHost ?? node.advertiseHost,
      agentVersion: parsed.data.agentVersion ?? node.agentVersion,
      capabilitiesJson: parsed.data.capabilities
        ? JSON.stringify(parsed.data.capabilities)
        : node.capabilitiesJson,
      host: parsed.data.advertiseHost ?? node.host,
    })
    .where(eq(nodes.id, node.id))

  return json({
    ok: true as const,
    nodeId: node.id,
    status: "online" as const,
  })
}

export async function handleAgentClaim(request: Request): Promise<Response> {
  const node = await requireNode(request)
  if (!node) return error("Unauthorized", 401)

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const parsed = agentClaimRequestSchema.safeParse(body)
  const waitMs = parsed.success ? (parsed.data.waitMs ?? 25_000) : 25_000

  const deadline = Date.now() + waitMs
  while (Date.now() <= deadline) {
    const job = await claimNextJob(node.id)
    if (job) {
      await markJobRunning(job.id, node.id)
      return json({
        job: {
          id: job.id,
          type: job.type,
          payload: job.payload,
          leaseExpiresAt: job.leaseExpiresAt.toISOString(),
        },
      })
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return json({ job: null })
}

export async function handleAgentProgress(
  request: Request,
  jobId: string,
): Promise<Response> {
  const node = await requireNode(request)
  if (!node) return error("Unauthorized", 401)

  const job = await getJobForNode(jobId, node.id)
  if (!job) return error("Job not found", 404)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return error("Invalid JSON", 400)
  }
  const parsed = agentJobProgressSchema.safeParse(body)
  if (!parsed.success) return error(parsed.error.message, 400)

  if (job.operationId && parsed.data.stage) {
    await updateOperationStage(job.operationId, parsed.data.stage)
    await markOperationRunning(job.operationId, parsed.data.stage)
  }

  if (job.type === "deploy") {
    let payload: { deploymentId?: string } = {}
    try {
      payload = JSON.parse(job.payloadJson) as { deploymentId?: string }
    } catch {
      // ignore
    }
    if (payload.deploymentId) {
      const stage = parsed.data.stage
      const allowed = [
        "queued",
        "analyzing",
        "building",
        "deploying",
        "checking",
        "running",
        "failed",
        "stopped",
      ] as const
      type DepStatus = (typeof allowed)[number]
      const status =
        stage && (allowed as readonly string[]).includes(stage)
          ? (stage as DepStatus)
          : undefined
      if (status || parsed.data.buildLogs !== undefined) {
        await db
          .update(deployments)
          .set({
            ...(status ? { status } : {}),
            ...(parsed.data.buildLogs !== undefined
              ? { buildLogs: parsed.data.buildLogs }
              : {}),
          })
          .where(eq(deployments.id, payload.deploymentId))
      }
    }
  }

  return json({ ok: true })
}

export async function handleAgentComplete(
  request: Request,
  jobId: string,
): Promise<Response> {
  const node = await requireNode(request)
  if (!node) return error("Unauthorized", 401)

  const job = await getJobForNode(jobId, node.id)
  if (!job) return error("Job not found", 404)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return error("Invalid JSON", 400)
  }
  const parsed = agentJobCompleteSchema.safeParse(body)
  if (!parsed.success) return error(parsed.error.message, 400)

  await completeJob({
    jobId,
    nodeId: node.id,
    ok: parsed.data.ok,
    result: parsed.data.result,
    error: parsed.data.error,
  })

  if (job.type === "deploy") {
    await finalizeDeployJob(job, node, parsed.data)
  } else if (job.operationId) {
    if (parsed.data.ok) {
      await markOperationSucceeded(job.operationId)
    } else {
      await markOperationFailed(job.operationId, {
        message: parsed.data.error?.message ?? "Agent job failed",
        code: parsed.data.error?.code,
      })
    }
  }

  return json({ ok: true })
}

async function finalizeDeployJob(
  job: { payloadJson: string; operationId: string | null },
  node: typeof nodes.$inferSelect,
  complete: AgentJobComplete,
) {
  let payload: {
    deploymentId?: string
    serviceId?: string
  } = {}
  try {
    payload = JSON.parse(job.payloadJson)
  } catch {
    // ignore
  }

  const deploymentId = payload.deploymentId
  const serviceId = payload.serviceId
  if (!deploymentId || !serviceId) return

  const [service] = await db
    .select()
    .from(services)
    .where(eq(services.id, serviceId))
  const [project] = service
    ? await db
        .select()
        .from(projects)
        .where(eq(projects.id, service.projectId))
    : [undefined]

  if (!complete.ok) {
    const message = complete.error?.message ?? "Deploy failed"
    const stage = complete.error?.stage ?? "failed"
    await db
      .update(deployments)
      .set({
        status: "failed",
        failedStage: stage,
        errorMessage: message,
        buildLogs: complete.result?.buildLogs ?? null,
      })
      .where(eq(deployments.id, deploymentId))
    await db
      .update(services)
      .set({
        status: "error",
        errorMessage: message,
      })
      .where(eq(services.id, serviceId))
    if (job.operationId) {
      await markOperationFailed(job.operationId, {
        message,
        code: complete.error?.code,
      })
    }
    return
  }

  const result = complete.result ?? {}
  const advertiseHost =
    result.advertiseHost ?? node.advertiseHost ?? node.host
  const publishedPort = result.publishedPort
  const upstream =
    result.upstream ??
    (advertiseHost && publishedPort
      ? `${advertiseHost}:${publishedPort}`
      : null)

  let publicUrl: string | null = null
  if (service?.type === "web" && project && upstream) {
    const auto = await upsertAutoHostname({
      serviceId: service.id,
      projectSlug: project.slug,
      serviceName: service.name,
      isPrimary: service.isPrimary,
      proxy: proxyService,
    })
    const hostnames = await listActiveHostnames(service.id)
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
    }
  }

  await db
    .update(deployments)
    .set({
      status: "running",
      containerId: result.containerId ?? null,
      image: result.image ?? null,
      buildLogs: result.buildLogs ?? null,
      gitSha: result.gitSha ?? null,
      buildStrategy: result.buildStrategy ?? null,
      errorMessage: null,
      failedStage: null,
    })
    .where(eq(deployments.id, deploymentId))

  await db
    .update(services)
    .set({
      status: "running",
      containerId: result.containerId ?? null,
      image: result.image ?? null,
      publicUrl,
      errorMessage: null,
      errorCode: null,
    })
    .where(eq(services.id, serviceId))

  if (job.operationId) {
    await markOperationSucceeded(job.operationId)
  }
}
