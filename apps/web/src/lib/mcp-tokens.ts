import { createHash, randomBytes } from "node:crypto"

import { and, db, eq, isNull, mcpTokens, user } from "@deplow/db"

import type { Session } from "@/lib/auth"

const TOKEN_PREFIX = "deplow_"

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function generateMcpTokenPlaintext(): {
  token: string
  prefix: string
  tokenHash: string
} {
  const secret = randomBytes(32).toString("base64url")
  const token = `${TOKEN_PREFIX}${secret}`
  return {
    token,
    prefix: token.slice(0, 12),
    tokenHash: hashMcpToken(token),
  }
}

export async function createMcpToken(input: {
  userId: string
  name: string
}): Promise<{
  id: string
  name: string
  prefix: string
  token: string
  createdAt: string
}> {
  const name = input.name.trim()
  if (!name || name.length > 64) {
    throw new Error("Token name must be 1–64 characters")
  }
  const { token, prefix, tokenHash } = generateMcpTokenPlaintext()
  const id = crypto.randomUUID()
  await db.insert(mcpTokens).values({
    id,
    userId: input.userId,
    name,
    tokenHash,
    prefix,
  })
  return {
    id,
    name,
    prefix,
    token,
    createdAt: new Date().toISOString(),
  }
}

export async function listMcpTokens(userId: string) {
  const rows = await db
    .select()
    .from(mcpTokens)
    .where(and(eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt)))
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  }))
}

export async function revokeMcpToken(userId: string, tokenId: string) {
  const [row] = await db
    .select()
    .from(mcpTokens)
    .where(eq(mcpTokens.id, tokenId))
  if (!row || row.userId !== userId) {
    return false
  }
  if (row.revokedAt) return true
  await db
    .update(mcpTokens)
    .set({ revokedAt: new Date() })
    .where(eq(mcpTokens.id, tokenId))
  return true
}

export function parseBearerToken(authorization: string | null): string | null {
  if (!authorization) return null
  const match = /^Bearer\s+(\S+)/i.exec(authorization.trim())
  return match?.[1] ?? null
}

/**
 * Resolve a Better Auth–compatible Session from an MCP Bearer token.
 * Updates lastUsedAt on success.
 */
export async function resolveSessionFromMcpToken(
  rawToken: string,
): Promise<Session | null> {
  const tokenHash = hashMcpToken(rawToken)
  const [row] = await db
    .select()
    .from(mcpTokens)
    .where(and(eq(mcpTokens.tokenHash, tokenHash), isNull(mcpTokens.revokedAt)))
  if (!row) return null

  const [owner] = await db.select().from(user).where(eq(user.id, row.userId))
  if (!owner) return null

  void db
    .update(mcpTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpTokens.id, row.id))
    .catch(() => undefined)

  const now = new Date()
  return {
    user: {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      emailVerified: owner.emailVerified,
      image: owner.image,
      createdAt: owner.createdAt,
      updatedAt: owner.updatedAt,
      instanceAdmin: owner.instanceAdmin,
    },
    session: {
      id: `mcp:${row.id}`,
      token: `mcp:${row.id}`,
      userId: owner.id,
      expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      createdAt: row.createdAt,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
  }
}
