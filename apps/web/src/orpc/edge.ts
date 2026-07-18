import { ORPCError } from "@orpc/server"
import {
  netbirdConnectInputSchema,
  netbirdListDomainsInputSchema,
} from "@deplow/shared"

import { assertInstanceAdmin } from "@/lib/access"
import { edgeRegistry } from "@/lib/k8s/edge"
import {
  getNetbirdEdgeStatus,
  listManagedDomains,
} from "@/lib/k8s/edge/netbird"

import { authedProcedure } from "./middleware"

export const netbirdStatus = authedProcedure.handler(async ({ context }) => {
  await assertInstanceAdmin(context.session!)
  return getNetbirdEdgeStatus()
})

export const netbirdListManagedDomains = authedProcedure
  .input(netbirdListDomainsInputSchema)
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    try {
      return await listManagedDomains(input)
    } catch (error) {
      throw new ORPCError("BAD_REQUEST", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

export const netbirdConnect = authedProcedure
  .input(netbirdConnectInputSchema)
  .handler(async ({ context, input }) => {
    await assertInstanceAdmin(context.session!)
    try {
      const provider = edgeRegistry().get("netbird")
      if (!provider.connect) {
        throw new Error("NetBird edge provider does not support connect")
      }
      return await provider.connect(input)
    } catch (error) {
      throw new ORPCError("BAD_REQUEST", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

export const netbirdDisconnect = authedProcedure.handler(
  async ({ context }) => {
    await assertInstanceAdmin(context.session!)
    try {
      const provider = edgeRegistry().get("netbird")
      await provider.disconnect?.()
      return { ok: true as const }
    } catch (error) {
      throw new ORPCError("BAD_REQUEST", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  },
)
