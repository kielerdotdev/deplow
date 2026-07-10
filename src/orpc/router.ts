import { os } from "@orpc/server"
import * as z from "zod"

export const health = os.handler(async () => ({
  ok: true as const,
  time: new Date().toISOString(),
}))

export const greet = os
  .input(z.object({ name: z.string().min(1) }))
  .handler(async ({ input }) => ({
    message: `Hello, ${input.name}!`,
  }))

export const router = {
  health,
  greet,
}
