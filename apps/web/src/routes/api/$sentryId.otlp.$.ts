import { createFileRoute } from "@tanstack/react-router"
import { extractSentryKey } from "@deplow/observe"

import { env } from "@/lib/env"
import { injectProjectIdIntoOtlpJson } from "@/lib/observe/otlp-inject"
import {
  findActiveKey,
  findObserveProjectBySentryId,
} from "@/lib/observe/store"

/**
 * OTLP gateway: authenticate DSN key, inject project id, proxy to otelcol.
 * Paths: /api/:sentryId/otlp/v1/{traces|metrics|logs}
 */
export const Route = createFileRoute("/api/$sentryId/otlp/$")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers":
              "content-type, x-sentry-auth, authorization",
          },
        }),
      POST: async ({ request, params }) => {
        if (!env.observeEnabled) {
          return new Response("Observe disabled", { status: 404 })
        }
        const sentryId = Number(params.sentryId)
        if (!Number.isFinite(sentryId)) {
          return new Response("Forbidden", { status: 403 })
        }
        const observeProject = await findObserveProjectBySentryId(sentryId)
        if (!observeProject?.enabled) {
          return new Response("Forbidden", { status: 403 })
        }
        const url = new URL(request.url)
        const auth = extractSentryKey({
          authHeader: request.headers.get("x-sentry-auth"),
          queryKey: url.searchParams.get("sentry_key"),
        })
        if (!auth) {
          return new Response("Forbidden", { status: 403 })
        }
        const key = await findActiveKey(observeProject.id, auth.publicKey)
        if (!key) {
          return new Response("Forbidden", { status: 403 })
        }

        const splat = params._splat ?? ""
        const targetPath = splat.startsWith("v1/")
          ? `/${splat}`
          : `/v1/${splat.replace(/^\//, "")}`
        const target = `${env.otelcolUrl.replace(/\/$/, "")}${targetPath}`

        const contentType = request.headers.get("content-type")
        const raw = Buffer.from(await request.arrayBuffer())
        const body = injectProjectIdIntoOtlpJson(
          raw,
          contentType,
          observeProject.projectId,
        )

        const headers = new Headers(request.headers)
        headers.delete("host")
        headers.delete("content-length")
        // Body is fully buffered; chunked TE must not be forwarded with Content-Length.
        headers.delete("transfer-encoding")
        headers.set("X-Deplow-Project-Id", observeProject.projectId)
        headers.set("X-Deplow-Sentry-Id", String(sentryId))
        headers.set("Content-Length", String(body.byteLength))

        try {
          const upstream = await fetch(target, {
            method: "POST",
            headers,
            body,
          })
          return new Response(upstream.body, {
            status: upstream.status,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Content-Type":
                upstream.headers.get("content-type") ?? "application/json",
            },
          })
        } catch (err) {
          console.error("[observe] otlp proxy failed", err)
          return new Response("OTLP upstream unavailable", { status: 503 })
        }
      },
    },
  },
})
