import { createFileRoute } from "@tanstack/react-router"

import { env } from "@/lib/env"
import { ensureDogfoodBootstrap } from "@/lib/observe/dogfood"

/**
 * Dev dogfood: returns project-scoped DSN + OTEL (creates hostrig-dogfood if needed).
 */
export const Route = createFileRoute("/api/internal/dogfood")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!env.observeDogfood) {
          return Response.json({
            enabled: false,
            dsn: null,
            otelEndpoint: null,
          })
        }
        // Never expose DSN/OTEL headers unauthenticated on a public control plane.
        const { resolveActor } = await import("@/mcp/auth")
        const { isInstanceAdmin } = await import("@/lib/access")
        const session = await resolveActor(request.headers)
        if (!session || !(await isInstanceAdmin(session.user.id))) {
          return Response.json({ error: "Forbidden" }, { status: 403 })
        }
        const boot = await ensureDogfoodBootstrap()
        return Response.json({
          enabled: true,
          dsn: boot?.dsn ?? null,
          otelEndpoint: boot?.otelEndpoint ?? null,
          otelHeaders: boot?.otelHeaders ?? null,
          projectId: boot?.projectId ?? null,
          sentryId: boot?.sentryId ?? null,
          hint: boot
            ? undefined
            : "Sign in once so an org exists; dogfood project is created automatically.",
        })
      },
    },
  },
})
