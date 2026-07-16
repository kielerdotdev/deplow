import { ORPCError } from "@orpc/server"
import * as z from "zod"

import { eq } from "@deplow/db"
import {
  createJoinTokenInputSchema,
  registerNodeInputSchema,
} from "@deplow/shared"

import { encryptString } from "@/lib/core"
import { assertInstanceAdmin } from "@/lib/access"
import {
  createJoinToken as createJoinTokenRecord,
  isAgentOnline,
  listJoinTokens as listJoinTokenRecords,
  revokeJoinToken as revokeJoinTokenRecord,
} from "@/lib/agent/tokens"
import { env } from "@/lib/env"
import {
  db,
  dockerNodeExecutor,
  ensureLocalNodeId,
  nodes,
  platformConfig,
} from "@/lib/services"

import { authedProcedure } from "./middleware"

function toSummary(
  row: typeof nodes.$inferSelect,
  runtime?: {
    appRuntime?: string
    appRuntimeAvailable?: boolean
    appRuntimeRequired?: boolean
  },
) {
  const agentOnline =
    row.provider === "agent" ? isAgentOnline(row) : undefined
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    host: row.host,
    status:
      row.provider === "agent"
        ? agentOnline
          ? ("online" as const)
          : ("offline" as const)
        : row.status,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    advertiseHost: row.advertiseHost,
    agentVersion: row.agentVersion,
    ...runtime,
  }
}

export const list = authedProcedure.handler(async () => {
  const rows = await db.select().from(nodes)
  let runtime:
    | {
        appRuntime: string
        appRuntimeAvailable: boolean
        appRuntimeRequired: boolean
      }
    | undefined
  try {
    runtime = await dockerNodeExecutor.getRuntimeStatus()
  } catch {
    runtime = undefined
  }

  return rows.map((row) =>
    toSummary(
      row,
      row.provider === "docker" && runtime
        ? {
            appRuntime: runtime.appRuntime,
            appRuntimeAvailable: runtime.appRuntimeAvailable,
            appRuntimeRequired: runtime.appRuntimeRequired,
          }
        : undefined,
    ),
  )
})

export const register = authedProcedure
  .input(registerNodeInputSchema)
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    const existing = await db
      .select()
      .from(nodes)
      .where(eq(nodes.name, input.name))
    if (existing.length > 0) {
      throw new ORPCError("CONFLICT", {
        message: `Node "${input.name}" already exists`,
      })
    }

    const id = crypto.randomUUID()
    const sshKeyEncrypted = input.sshPrivateKey
      ? encryptString(input.sshPrivateKey, platformConfig.secretsEncryptionKey)
      : null

    let status: "online" | "offline" | "unknown" = "unknown"
    if (input.provider === "docker") {
      const probe = await dockerNodeExecutor.getStatus(id)
      status = probe.online ? "online" : "offline"
    }

    await db.insert(nodes).values({
      id,
      name: input.name,
      provider: input.provider,
      host: input.host,
      port: input.port ?? 22,
      username: input.username,
      sshKeyEncrypted,
      status,
      lastSeenAt: status === "online" ? new Date() : null,
    })

    const [row] = await db.select().from(nodes).where(eq(nodes.id, id))
    return toSummary(row!)
  })

export const remove = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    const [row] = await db.select().from(nodes).where(eq(nodes.id, input.id))
    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Node not found" })
    }
    if (row.name === "local") {
      throw new ORPCError("BAD_REQUEST", {
        message: "The local node cannot be removed",
      })
    }
    await db.delete(nodes).where(eq(nodes.id, input.id))
    return { ok: true as const }
  })

export const status = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ input }) => {
    const [row] = await db.select().from(nodes).where(eq(nodes.id, input.id))
    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Node not found" })
    }
    if (row.provider === "docker") {
      const result = await dockerNodeExecutor.getStatus(row.id)
      await db
        .update(nodes)
        .set({
          status: result.online ? "online" : "offline",
          lastSeenAt: result.online ? new Date() : row.lastSeenAt,
        })
        .where(eq(nodes.id, row.id))
      return result
    }
    if (row.provider === "agent") {
      const online = isAgentOnline(row)
      return {
        online,
        docker: online ? ("running" as const) : ("unknown" as const),
        message: online
          ? `Agent online${row.agentVersion ? ` · v${row.agentVersion}` : ""}`
          : "Agent offline (no recent heartbeat)",
        appRuntime: undefined,
        appRuntimeAvailable: undefined,
        appRuntimeRequired: undefined,
      }
    }
    return {
      online: false,
      docker: "unknown" as const,
      message: "SSH status probe not implemented",
    }
  })

export const ensureLocal = authedProcedure.handler(async () => {
  const id = await ensureLocalNodeId()
  const [row] = await db.select().from(nodes).where(eq(nodes.id, id))
  return toSummary(row!)
})

export const createJoinToken = authedProcedure
  .input(createJoinTokenInputSchema)
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    const created = await createJoinTokenRecord({
      userId: context.session!.user.id,
      label: input.label,
      ttlSeconds: input.ttlSeconds,
    })
    const publicUrl = env.publicControlPlaneUrl.replace(/\/$/, "")
    const installCommand = `curl -sSL ${publicUrl}/install-agent.sh | sudo bash -s -- --url ${publicUrl} --token ${created.token}`
    return {
      id: created.id,
      token: created.token,
      prefix: created.prefix,
      expiresAt: created.expiresAt.toISOString(),
      installCommand,
      publicUrl,
    }
  })

export const listJoinTokens = authedProcedure.handler(async ({ context }) => {
  await assertInstanceAdmin(context.session!)
  return listJoinTokenRecords()
})

export const revokeJoinToken = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    const ok = await revokeJoinTokenRecord(input.id)
    if (!ok) {
      throw new ORPCError("NOT_FOUND", {
        message: "Join token not found or already redeemed",
      })
    }
    return { ok: true as const }
  })
