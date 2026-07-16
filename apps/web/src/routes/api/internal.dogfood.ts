import { createFileRoute } from "@tanstack/react-router"

import { env } from "@/lib/env"
import { ensureDogfoodBootstrap } from "@/lib/observe/dogfood"

/**
 * Dev dogfood: returns project-scoped DSN + OTEL (creates deplow-dogfood if needed).
 */
export const Route = createFileRoute("/api/internal/dogfood")({
  server: {
    handlers: {
      GET: async () => {
        if (!env.observeDogfood) {
          return Response.json({
            enabled: false,
            dsn: null,
            otelEndpoint: null,
          })
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
