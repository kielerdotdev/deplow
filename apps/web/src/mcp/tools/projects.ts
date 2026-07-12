import { createTool } from "@mastra/core/tools"
import { z } from "zod"

import { create as createProject, get as getProject } from "@/orpc/projects"

import { callAuthed, sessionFromMcpContext } from "./call"

export const projectCreateTool = createTool({
  id: "project_create",
  description:
    "Create an empty Deplow project. Name must be lowercase letters, numbers, and hyphens (used as slug).",
  inputSchema: z.object({
    name: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
        message: "Use lowercase letters, numbers, and hyphens",
      }),
  }),
  execute: async (input, context) => {
    const session = sessionFromMcpContext(context)
    return callAuthed(createProject, input, session)
  },
})

export const projectGetTool = createTool({
  id: "project_get",
  description: "Get a project by id, including services and public URLs.",
  inputSchema: z.object({
    id: z.string().min(1),
  }),
  execute: async (input, context) => {
    const session = sessionFromMcpContext(context)
    return callAuthed(getProject, input, session)
  },
})
