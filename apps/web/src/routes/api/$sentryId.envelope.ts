import { createFileRoute } from "@tanstack/react-router"

import {
  handleEnvelopeRequest,
  observeCorsOptions,
} from "@/lib/observe/ingest-http"

export const Route = createFileRoute("/api/$sentryId/envelope")({
  server: {
    handlers: {
      OPTIONS: async () => observeCorsOptions(),
      POST: async ({ request, params }) =>
        handleEnvelopeRequest(request, params.sentryId),
    },
  },
})
