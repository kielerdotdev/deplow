import { ORPCError } from "@orpc/server"
import * as z from "zod"

import { and, eq } from "@hostrig/db"
import { createBindingInputSchema } from "@hostrig/shared"

import { assertProjectAccess } from "@/lib/access"
import {
  db,
  serviceBindings,
  services,
} from "@/lib/services"

import { authedProcedure, writeProcedure } from "./middleware"

async function accessibleService(id: string, session: Parameters<typeof assertProjectAccess>[1]) {
  const [service] = await db.select().from(services).where(eq(services.id, id))
  if (!service) throw new ORPCError("NOT_FOUND", { message: "Not found" })
  const project = await assertProjectAccess(service.projectId, session)
  return { service, project }
}

function bindingSummary(
  row: typeof serviceBindings.$inferSelect,
  provider?: typeof services.$inferSelect | null,
) {
  return {
    id: row.id,
    projectId: row.projectId,
    consumerServiceId: row.consumerServiceId,
    providerServiceId: row.providerServiceId,
    envKey: row.envKey,
    principal: row.principal,
    providerName: provider?.name ?? null,
    providerType: provider?.type ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

export const list = authedProcedure
  .input(z.object({ consumerServiceId: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    await accessibleService(input.consumerServiceId, context.session!)
    const rows = await db
      .select()
      .from(serviceBindings)
      .where(eq(serviceBindings.consumerServiceId, input.consumerServiceId))
    return Promise.all(
      rows.map(async (row) => {
        const [provider] = await db
          .select()
          .from(services)
          .where(eq(services.id, row.providerServiceId))
        return bindingSummary(row, provider)
      }),
    )
  })

export const create = writeProcedure
  .input(createBindingInputSchema)
  .handler(async ({ context, input }) => {
    const { service: consumer, project } = await accessibleService(
      input.consumerServiceId,
      context.session!,
    )
    if (consumer.type !== "web" && consumer.type !== "worker") {
      throw new ORPCError("BAD_REQUEST", {
        message: "Only web/worker services can bind to resources",
      })
    }
    const { service: provider } = await accessibleService(
      input.providerServiceId,
      context.session!,
    )
    if (provider.projectId !== project.id) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Services must be in the same project",
      })
    }
    if (provider.type !== "postgres" && provider.type !== "redis") {
      throw new ORPCError("BAD_REQUEST", {
        message: "Provider must be postgres or redis",
      })
    }

    const existing = await db
      .select()
      .from(serviceBindings)
      .where(
        and(
          eq(serviceBindings.consumerServiceId, consumer.id),
          eq(serviceBindings.envKey, input.envKey),
        ),
      )
    if (existing.length) {
      throw new ORPCError("CONFLICT", {
        message: `Env key ${input.envKey} is already bound`,
      })
    }

    const id = crypto.randomUUID()
    await db.insert(serviceBindings).values({
      id,
      projectId: project.id,
      consumerServiceId: consumer.id,
      providerServiceId: provider.id,
      envKey: input.envKey,
      principal: input.principal ?? null,
    })
    const [row] = await db
      .select()
      .from(serviceBindings)
      .where(eq(serviceBindings.id, id))
    return bindingSummary(row!, provider)
  })

export const destroy = writeProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const [row] = await db
      .select()
      .from(serviceBindings)
      .where(eq(serviceBindings.id, input.id))
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Binding not found" })
    await accessibleService(row.consumerServiceId, context.session!)
    await db.delete(serviceBindings).where(eq(serviceBindings.id, row.id))
    return { ok: true as const }
  })
