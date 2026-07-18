import { ORPCError, os } from "@orpc/server"

import type { Session } from "@/lib/auth"
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

/** True when the actor is an MCP token limited to read scope. */
export function isReadOnlyMcpSession(session: Session | null | undefined): boolean {
  const scopes = session?.mcpScopes
  if (!scopes || scopes.length === 0) return false
  if (scopes.includes("*")) return false
  return scopes.includes("read")
}

/**
 * Authenticated procedure that rejects MCP read-only tokens.
 * Use for create/update/delete/deploy/secret mutations.
 */
export const writeProcedure = authedProcedure.use(
  async ({ context, next }) => {
    if (isReadOnlyMcpSession(context.session)) {
      throw new ORPCError("FORBIDDEN", {
        message: "This API token is read-only",
      })
    }
    return next()
  },
)
