import { createTool } from "@mastra/core/tools"

import { createAndDeployServiceInputSchema } from "@deplow/shared"

import { createAndDeploy } from "@/orpc/services"

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
