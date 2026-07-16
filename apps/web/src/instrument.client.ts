/**
 * Browser Sentry init for Observe dogfood (errors + browser tracing).
 * Call `initDogfoodBrowser()` before hydrating.
 */
import * as Sentry from "@sentry/react"

const INGEST_PATH = /\/api\/\d+\/(envelope|store|otlp)(?:\/|$)/i

let initialized = false

function readEmbeddedDsn(): string {
  if (typeof window !== "undefined") {
    const w = window as Window & { __DEPLOW_DOGFOOD_DSN__?: string }
    if (w.__DEPLOW_DOGFOOD_DSN__) return w.__DEPLOW_DOGFOOD_DSN__
  }
  if (typeof import.meta !== "undefined") {
    const v = (import.meta as ImportMeta & { env?: Record<string, string> }).env
      ?.VITE_DEPLOW_OBSERVE_DOGFOOD_DSN
    if (v) return v
  }
  return ""
}

function shouldIgnoreBrowserUrl(url: string): boolean {
  try {
    const path = new URL(url, window.location.origin).pathname
    if (path === "/api/internal/dogfood" || path.startsWith("/api/internal/dogfood?"))
      return true
    return INGEST_PATH.test(path)
  } catch {
    return INGEST_PATH.test(url) || url.includes("/api/internal/dogfood")
  }
}

export async function initDogfoodBrowser(): Promise<void> {
  if (initialized || typeof window === "undefined") return

  let dsn = readEmbeddedDsn()
  if (!dsn) {
    try {
      const res = await fetch("/api/internal/dogfood")
      if (res.ok) {
        const body = (await res.json()) as { dsn?: string | null }
        dsn = body.dsn ?? ""
        if (dsn) {
          ;(
            window as Window & { __DEPLOW_DOGFOOD_DSN__?: string }
          ).__DEPLOW_DOGFOOD_DSN__ = dsn
        }
      }
    } catch {
      // Observe/CH may be down — skip quietly
    }
  }

  if (!dsn) return

  Sentry.init({
    dsn,
    environment: "development",
    // Light browser tracing for Issues context; server OTEL owns Observe traces.
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    integrations: [
      Sentry.browserTracingIntegration({
        shouldCreateSpanForRequest(url) {
          return !shouldIgnoreBrowserUrl(url)
        },
      }),
    ],
    tracePropagationTargets: [
      "localhost",
      /^https?:\/\/127\./,
      /^https?:\/\/192\./,
    ],
    beforeSend(event) {
      if (event.request?.url && shouldIgnoreBrowserUrl(event.request.url))
        return null
      return event
    },
  })
  initialized = true
  console.info(
    "[observe-dogfood] browser Sentry →",
    dsn.replace(/\/\/.*@/, "//***@"),
  )
}

export { Sentry }
