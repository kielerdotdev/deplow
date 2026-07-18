import { ORPCError } from "@orpc/server"
import * as z from "zod"

import { desc, eq } from "@hostrig/db"

import { assertProjectAccess } from "@/lib/access"
import { toOperationSummary } from "@/lib/core"
import { db, operations, services } from "@/lib/services"

import { authedProcedure } from "./middleware"

export const list = authedProcedure
  .input(
    z.object({
      projectId: z.string().min(1).optional(),
      serviceId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    if (input.serviceId) {
      const [service] = await db
        .select()
        .from(services)
        .where(eq(services.id, input.serviceId))
      if (!service) throw new ORPCError("NOT_FOUND", { message: "Not found" })
      await assertProjectAccess(service.projectId, context.session!)
      const rows = await db
        .select()
        .from(operations)
        .where(eq(operations.serviceId, service.id))
        .orderBy(desc(operations.createdAt))
        .limit(50)
      return rows.map(toOperationSummary)
    }
    if (!input.projectId) {
      throw new ORPCError("BAD_REQUEST", {
        message: "projectId or serviceId required",
      })
    }
    await assertProjectAccess(input.projectId, context.session!)
    const rows = await db
      .select()
      .from(operations)
      .where(eq(operations.projectId, input.projectId))
      .orderBy(desc(operations.createdAt))
      .limit(100)
    return rows.map(toOperationSummary)
  })

export const get = authedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const [row] = await db
      .select()
      .from(operations)
      .where(eq(operations.id, input.id))
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Operation not found" })
    await assertProjectAccess(row.projectId, context.session!)
    return toOperationSummary(row)
  })
