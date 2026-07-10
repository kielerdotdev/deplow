import { createFileRoute } from "@tanstack/react-router"

import { auth } from "@/lib/auth"

async function handleAuthRequest(request: Request) {
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
