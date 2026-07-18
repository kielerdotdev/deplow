import { createTool } from "@mastra/core/tools"

import { analyzeSourceInputSchema } from "@hostrig/shared"

import { analyzeSource } from "@/orpc/services"

import { callAuthed, sessionFromMcpContext } from "./call"

export const sourceAnalyzeTool = createTool({
  id: "source_analyze",
  description:
    "Analyze a git repository for build strategy (Railpack/Dockerfile). Returns analysisId and fingerprint required by service_create_and_deploy.",
  inputSchema: analyzeSourceInputSchema,
  execute: async (input, context) => {
    const session = sessionFromMcpContext(context)
    return callAuthed(analyzeSource, input, session)
  },
})
