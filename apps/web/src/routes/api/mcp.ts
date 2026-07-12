import { randomUUID } from "node:crypto"

import { createFileRoute } from "@tanstack/react-router"
import { toFetchResponse, toReqRes } from "fetch-to-node"

import { resolveMcpAuthInfo } from "@/mcp/auth"
import { deplowMcpServer } from "@/mcp/server"
import { env } from "@/lib/env"

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const url = new URL(request.url)
        if (url.pathname !== "/api/mcp" && !url.pathname.startsWith("/api/mcp/")) {
          return new Response("Not Found", { status: 404 })
        }

        const authInfo = await resolveMcpAuthInfo(
          request.headers.get("authorization"),
        )
        if (!authInfo) {
          return new Response(
            JSON.stringify({ error: "Unauthorized", message: "Bearer MCP token required" }),
            {
              status: 401,
              headers: {
                "content-type": "application/json",
                "www-authenticate": 'Bearer realm="deplow-mcp"',
              },
            },
          )
        }

        const { req, res } = toReqRes(request)
        // Mastra exposes req.auth as context.mcp.extra.authInfo in tools
        ;(req as { auth?: typeof authInfo }).auth = authInfo

        const publicBase = env.publicControlPlaneUrl.replace(/\/$/, "")
        const requestUrl = new URL(request.url, publicBase)

        await deplowMcpServer.startHTTP({
          url: requestUrl,
          httpPath: "/api/mcp",
          req,
          res,
          options: {
            sessionIdGenerator: () => randomUUID(),
          },
        })

        return toFetchResponse(res)
      },
    },
  },
})
