import { createFileRoute } from "@tanstack/react-router"
import * as z from "zod"

import { completeBootstrap } from "@/lib/k8s/cluster-store"
import {
  clientIpFromRequest,
  consumeRateLimit,
  rateLimitResponse,
} from "@/lib/rate-limit"

const bodySchema = z.object({
  token: z.string().min(8),
  kubeconfig: z.string().min(32),
  nodeToken: z.string().min(8).optional(),
  externalIp: z.string().min(3).optional(),
})

const BOOTSTRAP_IP_LIMIT = 20
const BOOTSTRAP_IP_WINDOW_MS = 60_000

/**
 * Unauthenticated bootstrap callback for k3s server cloud-init.
 * Secured by one-time bootstrap token minted when creating the cluster.
 */
export const Route = createFileRoute("/api/cluster/bootstrap")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = clientIpFromRequest(request)
        const limited = consumeRateLimit(
          `cluster-bootstrap:ip:${ip}`,
          BOOTSTRAP_IP_LIMIT,
          BOOTSTRAP_IP_WINDOW_MS,
        )
        if (!limited.ok) return rateLimitResponse(limited.retryAfterSec)

        let json: unknown
        try {
          json = await request.json()
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 })
        }
        const parsed = bodySchema.safeParse(json)
        if (!parsed.success) {
          return Response.json({ error: "Invalid body" }, { status: 400 })
        }
        try {
          const result = await completeBootstrap(parsed.data)
          return Response.json(result)
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          return Response.json({ error: message }, { status: 400 })
        }
      },
    },
  },
})
