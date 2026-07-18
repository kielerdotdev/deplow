import { createTool } from "@mastra/core/tools"
import { z } from "zod"

import { createAndDeployServiceInputSchema } from "@hostrig/shared"

import {
  create as createService,
  createAndDeploy,
  list as listServices,
} from "@/orpc/services"

import { callAuthed, sessionFromMcpContext } from "./call"

export const serviceCreateAndDeployTool = createTool({
  id: "service_create_and_deploy",
  description:
    "Create a web/worker service from a prior source_analyze result and register the git webhook. Deploy builds from Git when a default registry is configured (Settings → Registries), or uses a prebuilt image. Requires analysisId + fingerprint from source_analyze.",
  inputSchema: createAndDeployServiceInputSchema,
  execute: async (input, context) => {
    const session = sessionFromMcpContext(context)
    return callAuthed(createAndDeploy, input, session)
  },
})

export const serviceListTool = createTool({
  id: "service_list",
  description: "List services in a project (web, worker, postgres, redis).",
  inputSchema: z.object({
    projectId: z.string().min(1),
  }),
  execute: async (input, context) => {
    const session = sessionFromMcpContext(context)
    return callAuthed(listServices, input, session)
  },
})

export const serviceAddPostgresTool = createTool({
  id: "service_add_postgres",
  description:
    "Add a Postgres service to a project (explicit data plane — never invented by deploy_from_git). Bind apps afterward with binding_create.",
  inputSchema: z.object({
    projectId: z.string().min(1),
    name: z.string().min(1).max(64).default("postgres"),
  }),
  execute: async (input, context) => {
    const session = sessionFromMcpContext(context)
    return callAuthed(
      createService,
      {
        projectId: input.projectId,
        name: input.name,
        type: "postgres" as const,
      },
      session,
    )
  },
})

export const serviceAddRedisTool = createTool({
  id: "service_add_redis",
  description:
    "Add a Redis service to a project (explicit data plane — never invented by deploy_from_git). Bind apps afterward with binding_create.",
  inputSchema: z.object({
    projectId: z.string().min(1),
    name: z.string().min(1).max(64).default("redis"),
  }),
  execute: async (input, context) => {
    const session = sessionFromMcpContext(context)
    return callAuthed(
      createService,
      {
        projectId: input.projectId,
        name: input.name,
        type: "redis" as const,
      },
      session,
    )
  },
})
