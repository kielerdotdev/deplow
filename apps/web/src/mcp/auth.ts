import { auth, type Session } from "@/lib/auth"
import {
  parseBearerToken,
  resolveSessionFromMcpToken,
} from "@/lib/mcp-tokens"

/**
 * Resolve the authenticated actor from Better Auth session cookies
 * or an MCP personal access token (Authorization: Bearer …).
 */
export async function resolveActor(headers: Headers): Promise<Session | null> {
  const cookieSession = await auth.api.getSession({ headers })
  if (cookieSession) return cookieSession

  const bearer = parseBearerToken(headers.get("authorization"))
  if (!bearer) return null
  return resolveSessionFromMcpToken(bearer)
}

export type McpAuthInfo = {
  token: string
  clientId: string
  scopes: string[]
  extra: { session: Session; tokenId: string }
}

export async function resolveMcpAuthInfo(
  authorizationHeader: string | null,
): Promise<McpAuthInfo | null> {
  const bearer = parseBearerToken(authorizationHeader)
  if (!bearer) return null
  const session = await resolveSessionFromMcpToken(bearer)
  if (!session) return null
  const tokenId = session.session.id.replace(/^mcp:/, "")
  return {
    token: bearer,
    clientId: session.user.id,
    scopes: ["mcp"],
    extra: { session, tokenId },
  }
}
