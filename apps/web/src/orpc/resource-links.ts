import * as z from "zod"

import { eq } from "@hostrig/db"

import { assertProjectAccess } from "@/lib/access"
import { db, resourceLinks } from "@/lib/services"

import { authedProcedure } from "./middleware"

function summary(row: typeof resourceLinks.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    kind: row.kind,
    source: row.source,
    status: row.status,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export const list = authedProcedure
  .input(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    await assertProjectAccess(input.projectId, context.session!)
    const rows = await db
      .select()
      .from(resourceLinks)
      .where(eq(resourceLinks.projectId, input.projectId))
    return rows.map(summary)
  })
