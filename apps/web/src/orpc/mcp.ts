import { ORPCError } from "@orpc/server"
import * as z from "zod"

import {
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
} from "@/lib/mcp-tokens"

import { authedProcedure } from "./middleware"

export const listTokens = authedProcedure.handler(async ({ context }) => {
  return listMcpTokens(context.session!.user.id)
})

export const createToken = authedProcedure
  .input(
    z.object({
      name: z.string().min(1).max(64),
    }),
  )
  .handler(async ({ context, input }) => {
    try {
      return await createMcpToken({
        userId: context.session!.user.id,
        name: input.name,
      })
    } catch (error) {
      throw new ORPCError("BAD_REQUEST", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

export const revokeToken = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const ok = await revokeMcpToken(context.session!.user.id, input.id)
    if (!ok) {
      throw new ORPCError("NOT_FOUND", { message: "Token not found" })
    }
    return { ok: true as const }
  })
