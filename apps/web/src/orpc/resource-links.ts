import { ORPCError } from "@orpc/server"
import * as z from "zod"

import { eq } from "@deplow/db"

import { db, projects, resourceLinks } from "@/lib/services"

import { authedProcedure } from "./middleware"

async function assertOwner(projectId: string, ownerId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
  if (!project || project.ownerId !== ownerId) {
    throw new ORPCError("NOT_FOUND", { message: "Project not found" })
  }
}

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
    await assertOwner(input.projectId, context.session!.user.id)
    const rows = await db
      .select()
      .from(resourceLinks)
      .where(eq(resourceLinks.projectId, input.projectId))
    return rows.map(summary)
  })
