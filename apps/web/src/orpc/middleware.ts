import { ORPCError, os } from "@orpc/server"

import { resolveActor } from "@/mcp/auth"

import type { OrpcContext } from "./context"

export const publicProcedure = os.$context<OrpcContext>()

export const authedProcedure = publicProcedure.use(
  async ({ context, next }) => {
    const session = context.session ?? (await resolveActor(context.headers))
    if (!session) {
      throw new ORPCError("UNAUTHORIZED", { message: "Sign in required" })
    }
    return next({
      context: {
        ...context,
        session,
      },
    })
  },
)
