import { ORPCError } from "@orpc/server"
import * as z from "zod"

import { eq } from "@deplow/db"
import { registerNodeInputSchema } from "@deplow/shared"

import { encryptString } from "@/lib/core"
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
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    host: row.host,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    ...runtime,
  }
}

export const list = authedProcedure.handler(async () => {
  const rows = await db.select().from(nodes)
  // One runtime probe for the host — all local docker nodes share the daemon
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
  .handler(async ({ input }) => {
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

    // Probe docker for local nodes
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
  .handler(async ({ input }) => {
    const [row] = await db.select().from(nodes).where(eq(nodes.id, input.id))
    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Node not found" })
    }
    // Protect the default "local" node from accidental deletion
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
