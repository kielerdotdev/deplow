import { createFileRoute } from "@tanstack/react-router"

import { auth } from "@/lib/auth"
import {
  clientIpFromRequest,
  consumeRateLimit,
  rateLimitResponse,
} from "@/lib/rate-limit"

/** Auth endpoints are the brute-force / signup spam surface. */
const AUTH_LIMIT = 30
const AUTH_WINDOW_MS = 60_000
/** Stricter for password mutations */
const AUTH_WRITE_LIMIT = 15
const AUTH_WRITE_WINDOW_MS = 60_000

async function handleAuthRequest(request: Request) {
  const ip = clientIpFromRequest(request)
  const method = request.method.toUpperCase()
  const path = new URL(request.url).pathname.toLowerCase()

  // Always rate-limit by IP
  const general = consumeRateLimit(`auth:ip:${ip}`, AUTH_LIMIT, AUTH_WINDOW_MS)
  if (!general.ok) return rateLimitResponse(general.retryAfterSec)

  // Tighter bucket for sign-in / sign-up / password change
  const isSensitive =
    method !== "GET" &&
    (/sign-in|sign-up|sign-up\/email|sign-in\/email|change-password|forget-password|reset-password|request-password/.test(
      path,
    ) ||
      method === "POST")
  if (isSensitive) {
    const write = consumeRateLimit(
      `auth:write:${ip}`,
      AUTH_WRITE_LIMIT,
      AUTH_WRITE_WINDOW_MS,
    )
    if (!write.ok) return rateLimitResponse(write.retryAfterSec)
  }

  return auth.handler(request)
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthRequest(request),
      POST: ({ request }) => handleAuthRequest(request),
      PUT: ({ request }) => handleAuthRequest(request),
      PATCH: ({ request }) => handleAuthRequest(request),
      DELETE: ({ request }) => handleAuthRequest(request),
    },
  },
})
