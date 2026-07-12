import { call } from "@orpc/server"

import type { Session } from "@/lib/auth"
import type { McpAuthInfo } from "@/mcp/auth"
import type { OrpcContext } from "@/orpc/context"

type McpToolContext = {
  mcp?: {
    extra?: {
      authInfo?: unknown
    }
  }
}

export function sessionFromMcpContext(
  context: McpToolContext | undefined,
): Session {
  const authInfo = context?.mcp?.extra?.authInfo as McpAuthInfo | undefined
  const session = authInfo?.extra?.session
  if (!session) {
    throw new Error("MCP authentication required")
  }
  return session
}

export function orpcContextFromSession(session: Session): OrpcContext {
  return {
    headers: new Headers(),
    session,
  }
}

/** Invoke an oRPC procedure with a pre-resolved session (MCP / internal). */
export async function callAuthed<T>(
  procedure: unknown,
  input: unknown,
  session: Session,
): Promise<T> {
  return call(procedure as never, input as never, {
    context: orpcContextFromSession(session),
  }) as Promise<T>
}
