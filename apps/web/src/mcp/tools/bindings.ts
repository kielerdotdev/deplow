import { createTool } from "@mastra/core/tools"
import { z } from "zod"

import { create as createBinding } from "@/orpc/bindings"

import { callAuthed, sessionFromMcpContext } from "./call"

export const bindingCreateTool = createTool({
  id: "binding_create",
  description:
    "Bind a web/worker service to a postgres or redis provider via an env key (e.g. DATABASE_URL, REDIS_URL). Explicit — never auto-injected.",
  inputSchema: z.object({
    consumerServiceId: z.string().min(1),
    providerServiceId: z.string().min(1),
    envKey: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Z][A-Z0-9_]*$/, {
        message: "Env key must be UPPER_SNAKE_CASE",
      }),
    principal: z.string().max(128).optional(),
  }),
  execute: async (input, context) => {
    const session = sessionFromMcpContext(context)
    return callAuthed(createBinding, input, session)
  },
})
