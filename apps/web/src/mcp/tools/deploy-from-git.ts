import { createTool } from "@mastra/core/tools"
import { z } from "zod"

import { gitProviderSchema } from "@hostrig/shared"

import { get as getDeployment } from "@/orpc/deployments"
import { create as createProject, get as getProject } from "@/orpc/projects"
import { analyzeSource, createAndDeploy } from "@/orpc/services"

import { callAuthed, sessionFromMcpContext } from "./call"

const TERMINAL_OK = new Set(["success", "running"])
const TERMINAL_FAIL = new Set(["failed", "error", "cancelled", "canceled"])

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function guessProvider(
  repoUrl: string,
  provider?: "github" | "gitlab",
): "github" | "gitlab" {
  if (provider) return provider
  if (/gitlab/i.test(repoUrl)) return "gitlab"
  return "github"
}

function suggestServiceName(suggested: string): string {
  const cleaned = suggested
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return cleaned || "web"
}

export const deployFromGitTool = createTool({
  id: "deploy_from_git",
  description:
    "End-to-end: create a Hostrig project (unless projectId given), analyze a git repo, create a web service, deploy, and poll until the public URL is ready or the deploy fails. Prefer this over calling atomic tools unless you need finer control.",
  inputSchema: z.object({
    projectName: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
      .optional()
      .describe("Required when creating a new project"),
    projectId: z
      .string()
      .min(1)
      .optional()
      .describe("Use an existing project instead of creating one"),
    repoUrl: z.string().url(),
    branch: z.string().min(1).max(256).default("main"),
    provider: gitProviderSchema.optional(),
    accessToken: z
      .string()
      .min(1)
      .optional()
      .describe("PAT for private repos when platform git OAuth is not linked"),
    installationId: z.string().min(1).optional(),
    rootDirectory: z.string().max(512).optional(),
    dockerfilePath: z.string().max(512).nullable().optional(),
    serviceName: z.string().min(1).max(64).optional(),
    pollTimeoutMs: z.number().int().min(5_000).max(900_000).default(300_000),
    pollIntervalMs: z.number().int().min(1_000).max(30_000).default(3_000),
  }),
  execute: async (input, context) => {
    const session = sessionFromMcpContext(context)
    if (!input.projectId && !input.projectName) {
      return {
        ok: false as const,
        error: "Provide projectName (new) or projectId (existing).",
      }
    }

    let projectId = input.projectId
    if (!projectId) {
      const project = await callAuthed<{ id: string }>(
        createProject,
        { name: input.projectName! },
        session,
      )
      projectId = project.id
    }

    const provider = guessProvider(input.repoUrl, input.provider)
    const analysis = await callAuthed<{
      analysisId: string
      fingerprint: {
        repoUrl: string
        branch: string
        rootDirectory: string | null
        dockerfilePath: string | null
      }
      suggestedName: string
      suggestedType: "web" | "worker"
      needsChoice: "dockerfile" | "application" | null
      errors: string[]
    }>(
      analyzeSource,
      {
        provider,
        repoUrl: input.repoUrl,
        branch: input.branch,
        rootDirectory: input.rootDirectory,
        dockerfilePath: input.dockerfilePath,
        accessToken: input.accessToken,
        installationId: input.installationId,
      },
      session,
    )

    if (analysis.needsChoice) {
      return {
        ok: false as const,
        projectId,
        error:
          analysis.needsChoice === "dockerfile"
            ? "Multiple Dockerfiles found — re-call deploy_from_git with dockerfilePath set."
            : "Multiple applications found — re-call deploy_from_git with rootDirectory set.",
        analysis,
      }
    }

    if (analysis.errors?.length) {
      return {
        ok: false as const,
        projectId,
        error: analysis.errors.join("; "),
        analysis,
      }
    }

    const name =
      input.serviceName ?? suggestServiceName(analysis.suggestedName)

    const created = await callAuthed<{
      service: { id: string; publicUrl: string | null; status: string }
      deployment: { id: string; status: string } | null
    }>(
      createAndDeploy,
      {
        projectId,
        name,
        type: analysis.suggestedType === "worker" ? "worker" : "web",
        analysisId: analysis.analysisId,
        fingerprint: analysis.fingerprint,
        provider,
        repoUrl: input.repoUrl,
        branch: input.branch,
        accessToken: input.accessToken,
        installationId: input.installationId,
        rootDirectory: input.rootDirectory,
        dockerfilePath: input.dockerfilePath,
        autoWebhook: true,
      },
      session,
    )

    const deploymentId = created.deployment?.id
    if (!deploymentId) {
      return {
        ok: false as const,
        projectId,
        serviceId: created.service.id,
        error:
          "Service and git webhook were created, but no deployment was enqueued. Add a registry under Settings → Registries for git builds, or attach a prebuilt image.",
        service: created.service,
      }
    }

    const deadline = Date.now() + input.pollTimeoutMs
    let lastStatus = created.deployment?.status ?? "queued"
    let publicUrl: string | null = created.service.publicUrl

    while (Date.now() < deadline) {
      const dep = await callAuthed<{
        id: string
        status: string
        errorMessage?: string | null
        failure?: { rootCause: string | null; symptom: string | null } | null
      }>(getDeployment, { id: deploymentId }, session)

      lastStatus = dep.status
      if (TERMINAL_FAIL.has(dep.status)) {
        return {
          ok: false as const,
          projectId,
          serviceId: created.service.id,
          deploymentId,
          status: dep.status,
          error:
            dep.failure?.rootCause ||
            dep.failure?.symptom ||
            dep.errorMessage ||
            `Deploy ${dep.status}`,
          publicUrl,
        }
      }

      const project = await callAuthed<{
        services: Array<{
          id: string
          publicUrl: string | null
          status: string
        }>
      }>(getProject, { id: projectId }, session)

      const svc = project.services.find((s) => s.id === created.service.id)
      publicUrl = svc?.publicUrl ?? publicUrl

      if (
        (TERMINAL_OK.has(dep.status) || svc?.status === "running") &&
        publicUrl
      ) {
        return {
          ok: true as const,
          projectId,
          serviceId: created.service.id,
          deploymentId,
          status: dep.status,
          publicUrl,
        }
      }

      if (TERMINAL_OK.has(dep.status) && !publicUrl) {
        // Deploy succeeded but proxy URL not yet written — keep polling briefly
        if (Date.now() + input.pollIntervalMs >= deadline) {
          return {
            ok: true as const,
            projectId,
            serviceId: created.service.id,
            deploymentId,
            status: dep.status,
            publicUrl: null,
            warning:
              "Deploy finished but publicUrl is not set yet. Check Domains / ingress settings.",
          }
        }
      }

      await sleep(input.pollIntervalMs)
    }

    return {
      ok: false as const,
      projectId,
      serviceId: created.service.id,
      deploymentId,
      status: lastStatus,
      publicUrl,
      error: `Timed out after ${input.pollTimeoutMs}ms waiting for deploy (last status: ${lastStatus}). Use deployment_get / deployment_logs.`,
    }
  },
})
