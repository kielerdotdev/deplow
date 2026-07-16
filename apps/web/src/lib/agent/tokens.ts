import { createHash, randomBytes } from "node:crypto"

import { and, db, eq, isNull, nodeJoinTokens, nodes } from "@deplow/db"

const JOIN_PREFIX = "dj_"
const NODE_PREFIX = "dn_"

export const AGENT_ONLINE_MAX_AGE_MS = 90_000
export const JOB_LEASE_MS = 5 * 60_000

export function hashAgentToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function generateJoinTokenPlaintext(): {
  token: string
  prefix: string
  tokenHash: string
} {
  const secret = randomBytes(32).toString("base64url")
  const token = `${JOIN_PREFIX}${secret}`
  return {
    token,
    prefix: token.slice(0, 12),
    tokenHash: hashAgentToken(token),
  }
}

export function generateNodeTokenPlaintext(): {
  token: string
  tokenHash: string
} {
  const secret = randomBytes(32).toString("base64url")
  const token = `${NODE_PREFIX}${secret}`
  return { token, tokenHash: hashAgentToken(token) }
}

export async function createJoinToken(input: {
  userId: string
  label?: string
  ttlSeconds?: number
}): Promise<{ id: string; token: string; prefix: string; expiresAt: Date }> {
  const { token, prefix, tokenHash } = generateJoinTokenPlaintext()
  const id = crypto.randomUUID()
  const ttl = input.ttlSeconds ?? 3600
  const expiresAt = new Date(Date.now() + ttl * 1000)
  await db.insert(nodeJoinTokens).values({
    id,
    tokenHash,
    tokenPrefix: prefix,
    label: input.label ?? null,
    expiresAt,
    createdBy: input.userId,
  })
  return { id, token, prefix, expiresAt }
}

export async function listJoinTokens() {
  const rows = await db.select().from(nodeJoinTokens)
  return rows
    .map((r) => ({
      id: r.id,
      prefix: r.tokenPrefix,
      label: r.label,
      expiresAt: r.expiresAt.toISOString(),
      redeemedAt: r.redeemedAt?.toISOString() ?? null,
      nodeId: r.nodeId,
      createdAt: r.createdAt.toISOString(),
      expired: r.expiresAt.getTime() < Date.now() && !r.redeemedAt,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export async function revokeJoinToken(id: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(nodeJoinTokens)
    .where(eq(nodeJoinTokens.id, id))
  if (!row || row.redeemedAt) return false
  await db.delete(nodeJoinTokens).where(eq(nodeJoinTokens.id, id))
  return true
}

export async function redeemJoinToken(input: {
  joinToken: string
  name?: string
  advertiseHost?: string
  agentVersion?: string
  capabilities?: Record<string, unknown>
}): Promise<{ nodeId: string; nodeToken: string; name: string } | null> {
  const tokenHash = hashAgentToken(input.joinToken)
  const [join] = await db
    .select()
    .from(nodeJoinTokens)
    .where(
      and(eq(nodeJoinTokens.tokenHash, tokenHash), isNull(nodeJoinTokens.redeemedAt)),
    )
    .limit(1)
  if (!join) return null
  if (join.expiresAt.getTime() < Date.now()) return null

  const name =
    input.name?.trim() ||
    `agent-${randomBytes(3).toString("hex")}`

  const existing = await db.select().from(nodes).where(eq(nodes.name, name))
  if (existing.length > 0) {
    return null
  }

  const { token: nodeToken, tokenHash: agentTokenHash } =
    generateNodeTokenPlaintext()
  const nodeId = crypto.randomUUID()
  const now = new Date()

  await db.insert(nodes).values({
    id: nodeId,
    name,
    provider: "agent",
    host: input.advertiseHost ?? name,
    port: 0,
    agentTokenHash,
    advertiseHost: input.advertiseHost ?? null,
    agentVersion: input.agentVersion ?? null,
    capabilitiesJson: input.capabilities
      ? JSON.stringify(input.capabilities)
      : null,
    status: "online",
    lastSeenAt: now,
  })

  await db
    .update(nodeJoinTokens)
    .set({ redeemedAt: now, nodeId })
    .where(eq(nodeJoinTokens.id, join.id))

  return { nodeId, nodeToken, name }
}

export async function resolveNodeFromBearer(
  authorization: string | null,
): Promise<typeof nodes.$inferSelect | null> {
  if (!authorization?.startsWith("Bearer ")) return null
  const raw = authorization.slice("Bearer ".length).trim()
  if (!raw) return null
  const tokenHash = hashAgentToken(raw)
  const [node] = await db
    .select()
    .from(nodes)
    .where(eq(nodes.agentTokenHash, tokenHash))
    .limit(1)
  return node ?? null
}

export function isAgentOnline(node: {
  provider: string
  lastSeenAt: Date | null
  status: string
}): boolean {
  if (node.provider !== "agent") return node.status === "online"
  if (!node.lastSeenAt) return false
  return Date.now() - node.lastSeenAt.getTime() < AGENT_ONLINE_MAX_AGE_MS
}
