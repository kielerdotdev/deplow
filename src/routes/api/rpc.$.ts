import { RPCHandler } from "@orpc/server/fetch"
import { onError } from "@orpc/server"
import { createFileRoute } from "@tanstack/react-router"

import { router } from "@/orpc/router"

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

export const Route = createFileRoute("/api/rpc/$")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { response } = await handler.handle(request, {
          prefix: "/api/rpc",
          context: {}, // Provide initial context if needed
        })

        return response ?? new Response("Not Found", { status: 404 })
      },
    },
  },
})
