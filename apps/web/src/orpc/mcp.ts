import { ORPCError } from "@orpc/server"
import * as z from "zod"

import {
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
} from "@/lib/mcp-tokens"

import { authedProcedure, writeProcedure } from "./middleware"

export const listTokens = authedProcedure.handler(async ({ context }) => {
  return listMcpTokens(context.session!.user.id)
})

export const createToken = writeProcedure
  .input(
    z.object({
      name: z.string().min(1).max(64),
      scopes: z.array(z.enum(["*", "read"])).min(1).max(8).optional(),
      /** null / omitted = never expires */
      expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    try {
      return await createMcpToken({
        userId: context.session!.user.id,
        name: input.name,
        scopes: input.scopes,
        expiresInDays: input.expiresInDays,
      })
    } catch (error) {
      throw new ORPCError("BAD_REQUEST", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

export const revokeToken = writeProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const ok = await revokeMcpToken(context.session!.user.id, input.id)
    if (!ok) {
      throw new ORPCError("NOT_FOUND", { message: "Token not found" })
    }
    return { ok: true as const }
  })
