import { ORPCError, os } from "@orpc/server"

import { auth } from "@/lib/auth"

import type { OrpcContext } from "./context"

export const publicProcedure = os.$context<OrpcContext>()

export const authedProcedure = publicProcedure.use(
  async ({ context, next }) => {
    const session = await auth.api.getSession({ headers: context.headers })
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
