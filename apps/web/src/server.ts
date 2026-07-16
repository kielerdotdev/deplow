import "./instrument.server"

import { createServerEntry } from "@tanstack/react-start/server-entry"
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server"
import * as Sentry from "@sentry/node"

import { env } from "@/lib/env"
import { initDogfoodSentryServer } from "@/instrument.server"
import { startAlertEvaluator } from "@/lib/observe/alert-evaluator"
import {
  ensureDogfoodBootstrap,
  isDogfoodMetaPath,
  isObserveIngestUrl,
  type DogfoodBootstrap,
} from "@/lib/observe/dogfood"
import {
  dogfoodLog,
  initDogfoodOtel,
  shutdownDogfoodOtel,
} from "@/lib/observe/dogfood-otel"

const baseFetch = createStartHandler(defaultStreamHandler)

const DOGFOOD_READY_KEY = "__deplowDogfoodReady"

function dogfoodReadySlot(): {
  current: Promise<DogfoodBootstrap | null> | null
} {
  const g = globalThis as typeof globalThis & {
    [DOGFOOD_READY_KEY]?: { current: Promise<DogfoodBootstrap | null> | null }
  }
  if (!g[DOGFOOD_READY_KEY]) g[DOGFOOD_READY_KEY] = { current: null }
  return g[DOGFOOD_READY_KEY]
}

function ensureDogfood() {
  if (!env.observeDogfood) return Promise.resolve(null)
  const slot = dogfoodReadySlot()
  if (!slot.current) {
    slot.current = ensureDogfoodBootstrap()
      .then((boot) => {
        if (boot?.dsn) {
          if (boot.otelEndpoint && boot.projectId) {
            initDogfoodOtel({
              otelEndpoint: boot.otelEndpoint,
              otelHeaders: boot.otelHeaders,
              projectId: boot.projectId,
            })
          }
          initDogfoodSentryServer(boot.dsn)
          dogfoodLog(
            `request path online project=${boot.projectId} sentryId=${boot.sentryId}`,
            "info",
          )
        } else {
          // Allow retry after signup creates an org
          slot.current = null
        }
        return boot
      })
      .catch((err) => {
        console.warn("[observe-dogfood] failed to resolve DSN", err)
        slot.current = null
        return null
      })
  }
  return slot.current
}

if (typeof process !== "undefined") {
  const shutdown = () => {
    void shutdownDogfoodOtel()
  }
  process.once("SIGTERM", shutdown)
  process.once("SIGINT", shutdown)

  if (env.observeEnabled) {
    startAlertEvaluator(60_000)
  }
}

export default createServerEntry({
  async fetch(request) {
    await ensureDogfood()

    const url = new URL(request.url)
    // Still skip Sentry wrapping noise for ingest/meta; OTEL ignore hooks handle spans.
    if (
      env.observeDogfood &&
      (isObserveIngestUrl(url.href) || isDogfoodMetaPath(url.pathname))
    ) {
      return baseFetch(request)
    }

    try {
      return await baseFetch(request)
    } catch (error) {
      if (env.observeDogfood) Sentry.captureException(error)
      throw error
    }
  },
})
