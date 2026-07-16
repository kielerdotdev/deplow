import { readFileSync } from "node:fs"
import path from "node:path"

import { createFileRoute } from "@tanstack/react-router"

/**
 * Serve the agent install script at /install-agent.sh so Settings can
 * show: curl -sSL $PUBLIC_URL/install-agent.sh | sudo bash -s -- …
 */
export const Route = createFileRoute("/install-agent.sh")({
  server: {
    handlers: {
      GET: async () => {
        const candidates = [
          path.resolve(process.cwd(), "deploy/install-agent.sh"),
          path.resolve(process.cwd(), "../../deploy/install-agent.sh"),
          "/opt/deplow/install-agent.sh",
        ]
        for (const file of candidates) {
          try {
            const body = readFileSync(file, "utf8")
            return new Response(body, {
              status: 200,
              headers: {
                "content-type": "text/x-shellscript; charset=utf-8",
                "cache-control": "no-store",
              },
            })
          } catch {
            // try next
          }
        }
        return new Response("install-agent.sh not found on server", {
          status: 404,
        })
      },
    },
  },
})
