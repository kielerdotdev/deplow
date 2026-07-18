import { createTool } from "@mastra/core/tools"
import { z } from "zod"

import {
  create as createProject,
  destroy as destroyProject,
  get as getProject,
  list as listProjects,
} from "@/orpc/projects"

import { callAuthed, sessionFromMcpContext } from "./call"

export const projectCreateTool = createTool({
  id: "project_create",
  description:
    "Create an empty Hostrig project. Name must be lowercase letters, numbers, and hyphens (used as slug).",
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

export const projectListTool = createTool({
  id: "project_list",
  description: "List projects in the active organization.",
  inputSchema: z.object({}).default({}),
  execute: async (_input, context) => {
    const session = sessionFromMcpContext(context)
    // list has no input schema — pass void-compatible empty call
    return callAuthed(listProjects, undefined as never, session)
  },
})

export const projectDestroyTool = createTool({
  id: "project_destroy",
  description:
    "Destroy a project and tear down its Kubernetes namespace, services, and data workloads.",
  inputSchema: z.object({
    id: z.string().min(1),
  }),
  execute: async (input, context) => {
    const session = sessionFromMcpContext(context)
    return callAuthed(destroyProject, input, session)
  },
})
