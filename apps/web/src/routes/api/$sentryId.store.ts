import { createFileRoute } from "@tanstack/react-router"

import {
  handleStoreRequest,
  observeCorsOptions,
} from "@/lib/observe/ingest-http"

export const Route = createFileRoute("/api/$sentryId/store")({
  server: {
    handlers: {
      OPTIONS: async () => observeCorsOptions(),
      POST: async ({ request, params }) =>
        handleStoreRequest(request, params.sentryId),
    },
  },
})
