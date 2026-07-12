import { createTool } from "@mastra/core/tools"
import { z } from "zod"

import { get as getDeployment, logs as deploymentLogs } from "@/orpc/deployments"
import { get as getOperation } from "@/orpc/operations"

import { callAuthed, sessionFromMcpContext } from "./call"

export const deploymentGetTool = createTool({
  id: "deployment_get",
  description: "Get deployment status by id. Poll until status is success or failed.",
  inputSchema: z.object({
    id: z.string().min(1),
  }),
  execute: async (input, context) => {
    const session = sessionFromMcpContext(context)
    return callAuthed(getDeployment, input, session)
  },
})

export const operationGetTool = createTool({
  id: "operation_get",
  description: "Get a long-running operation by id (provision/deploy).",
  inputSchema: z.object({
    id: z.string().min(1),
  }),
  execute: async (input, context) => {
    const session = sessionFromMcpContext(context)
    return callAuthed(getOperation, input, session)
  },
})

export const deploymentLogsTool = createTool({
  id: "deployment_logs",
  description: "Fetch build and runtime logs for a service (optional deploymentId).",
  inputSchema: z.object({
    serviceId: z.string().min(1),
    deploymentId: z.string().min(1).optional(),
    since: z.string().optional(),
  }),
  execute: async (input, context) => {
    const session = sessionFromMcpContext(context)
    return callAuthed(deploymentLogs, input, session)
  },
})
