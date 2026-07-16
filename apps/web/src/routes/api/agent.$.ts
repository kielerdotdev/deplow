import { createFileRoute } from "@tanstack/react-router"

import {
  handleAgentClaim,
  handleAgentComplete,
  handleAgentHeartbeat,
  handleAgentJoin,
  handleAgentProgress,
} from "@/lib/agent/handlers"

function pathAfterAgent(url: string): string[] {
  const pathname = new URL(url).pathname
  const prefix = "/api/agent/"
  if (!pathname.startsWith(prefix)) return []
  return pathname.slice(prefix.length).split("/").filter(Boolean)
}

export const Route = createFileRoute("/api/agent/$")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parts = pathAfterAgent(request.url)

        if (parts.length === 1 && parts[0] === "join") {
          return handleAgentJoin(request)
        }
        if (parts.length === 1 && parts[0] === "heartbeat") {
          return handleAgentHeartbeat(request)
        }
        if (parts.length === 2 && parts[0] === "jobs" && parts[1] === "claim") {
          return handleAgentClaim(request)
        }
        if (
          parts.length === 3 &&
          parts[0] === "jobs" &&
          parts[2] === "progress"
        ) {
          return handleAgentProgress(request, parts[1]!)
        }
        if (
          parts.length === 3 &&
          parts[0] === "jobs" &&
          parts[2] === "complete"
        ) {
          return handleAgentComplete(request, parts[1]!)
        }

        return new Response(JSON.stringify({ error: "Not Found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      },
    },
  },
})
