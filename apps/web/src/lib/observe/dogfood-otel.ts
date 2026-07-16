/**
 * Dogfood OpenTelemetry: real Node SDK → project-scoped Observe OTLP gateway.
 */
import type { Context } from "@opentelemetry/api"
import { logs } from "@opentelemetry/api-logs"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { NodeSDK } from "@opentelemetry/sdk-node"
import {
  BatchSpanProcessor,
  type ReadableSpan,
  type Span,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base"
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions"

import { env } from "@/lib/env"

import { isDogfoodMetaPath, isObserveIngestUrl } from "./dogfood"

export type DogfoodOtelTarget = {
  otelEndpoint: string
  otelHeaders: string
  projectId: string
}

const INGEST_PATH =
  /\/api\/\d+\/(envelope|store|otlp)(?:\/|$)/i

/** Parse `x-sentry-auth=sentry sentry_key=…` into a headers object. */
export function parseOtelAuthHeaders(
  otelHeaders: string,
): Record<string, string> {
  const eq = otelHeaders.indexOf("=")
  if (eq <= 0) return {}
  return {
    [otelHeaders.slice(0, eq).trim()]: otelHeaders.slice(eq + 1).trim(),
  }
}

export function shouldIgnoreIncomingUrl(url: string): boolean {
  try {
    const u = new URL(url, "http://local")
    if (isDogfoodMetaPath(u.pathname)) return true
    if (INGEST_PATH.test(u.pathname)) return true
    return false
  } catch {
    return INGEST_PATH.test(url) || url.includes("/api/internal/dogfood")
  }
}

export function shouldIgnoreOutgoingUrl(url: string): boolean {
  if (isObserveIngestUrl(url)) return true
  try {
    const u = new URL(url, "http://local")
    if (isDogfoodMetaPath(u.pathname)) return true
    if (INGEST_PATH.test(u.pathname)) return true
    return false
  } catch {
    return INGEST_PATH.test(url)
  }
}

/** True if span name/attrs look like Observe ingest or dogfood meta traffic. */
export function isIngestNoiseSpan(span: {
  name: string
  attributes?: Record<string, unknown>
}): boolean {
  const name = span.name
  if (INGEST_PATH.test(name) || name.includes("/api/internal/dogfood")) {
    return true
  }
  const attrs = span.attributes ?? {}
  const candidates = [
    attrs["http.target"],
    attrs["http.route"],
    attrs["url.path"],
    attrs["url.full"],
    attrs["http.url"],
  ]
  for (const c of candidates) {
    if (typeof c === "string" && shouldIgnoreOutgoingUrl(c)) return true
  }
  return false
}

/** Drop self-ingest / meta spans that slip past instrumentation ignore hooks. */
class FilterIngestSpanProcessor implements SpanProcessor {
  constructor(private readonly next: SpanProcessor) {}

  onStart(span: Span, parentContext: Context): void {
    this.next.onStart(span, parentContext)
  }

  onEnd(span: ReadableSpan): void {
    if (isIngestNoiseSpan(span)) return
    this.next.onEnd(span)
  }

  forceFlush(): Promise<void> {
    return this.next.forceFlush()
  }

  shutdown(): Promise<void> {
    return this.next.shutdown()
  }
}

/**
 * Survive Vite SSR HMR: module-local `started` resets on reload and would
 * re-patch http/https, stacking ClientRequest listeners until MaxListeners
 * warnings flood the console.
 */
type DogfoodOtelGlobal = {
  sdk: NodeSDK | null
  started: boolean
}

const OTEL_GLOBAL_KEY = "__deplowDogfoodOtel"

function otelState(): DogfoodOtelGlobal {
  const g = globalThis as typeof globalThis & {
    [OTEL_GLOBAL_KEY]?: DogfoodOtelGlobal
  }
  if (!g[OTEL_GLOBAL_KEY]) {
    g[OTEL_GLOBAL_KEY] = { sdk: null, started: false }
  }
  return g[OTEL_GLOBAL_KEY]
}

export function initDogfoodOtel(target: DogfoodOtelTarget): void {
  const state = otelState()
  if (state.started || !target.otelEndpoint || !target.projectId) return

  const base = target.otelEndpoint.replace(/\/$/, "")
  const headers = parseOtelAuthHeaders(target.otelHeaders)
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "deplow-web",
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? "dev",
    "deployment.environment": env.isDev ? "development" : "dogfood",
    "deplow.project_id": target.projectId,
  })

  const traceExporter = new OTLPTraceExporter({
    url: `${base}/v1/traces`,
    headers,
  })
  const logExporter = new OTLPLogExporter({
    url: `${base}/v1/logs`,
    headers,
  })

  // Mark before start() so a concurrent/HMR call cannot race a second SDK.
  state.started = true

  const sdk = new NodeSDK({
    resource,
    spanProcessors: [
      new FilterIngestSpanProcessor(
        new BatchSpanProcessor(traceExporter, {
          maxExportBatchSize: 64,
          scheduledDelayMillis: 2000,
        }),
      ),
    ],
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: logExporter,
        scheduledDelayMillis: 2000,
      }),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
        // Avoid stacking listeners on Connect/Express/Router (TanStack Start).
        "@opentelemetry/instrumentation-express": { enabled: false },
        "@opentelemetry/instrumentation-router": { enabled: false },
        "@opentelemetry/instrumentation-connect": { enabled: false },
        "@opentelemetry/instrumentation-http": {
          ignoreIncomingRequestHook(req) {
            const host = req.headers?.host ?? "local"
            const path = req.url ?? "/"
            return shouldIgnoreIncomingUrl(`http://${host}${path}`)
          },
          ignoreOutgoingRequestHook(options) {
            const hostname =
              typeof options === "object" && options && "hostname" in options
                ? String(
                    (options as { hostname?: string }).hostname ?? "localhost",
                  )
                : "localhost"
            const path =
              typeof options === "object" && options && "path" in options
                ? String((options as { path?: string }).path ?? "/")
                : "/"
            const port =
              typeof options === "object" && options && "port" in options
                ? (options as { port?: number | string }).port
                : undefined
            const proto =
              typeof options === "object" &&
              options &&
              "protocol" in options &&
              String((options as { protocol?: string }).protocol).includes(
                "https",
              )
                ? "https"
                : "http"
            const portPart = port ? `:${port}` : ""
            return shouldIgnoreOutgoingUrl(
              `${proto}://${hostname}${portPart}${path}`,
            )
          },
        },
        "@opentelemetry/instrumentation-undici": {
          ignoreRequestHook(request) {
            const origin =
              typeof request === "object" && request && "origin" in request
                ? String((request as { origin?: string }).origin ?? "")
                : ""
            const path =
              typeof request === "object" && request && "path" in request
                ? String((request as { path?: string }).path ?? "/")
                : "/"
            return shouldIgnoreOutgoingUrl(`${origin}${path}`)
          },
        },
      }),
    ],
  })

  try {
    sdk.start()
    state.sdk = sdk
  } catch (err) {
    state.started = false
    state.sdk = null
    console.warn("[observe-dogfood] OTEL start failed", err)
    return
  }

  dogfoodLog("deplow dogfood OpenTelemetry online", "info")

  console.info(
    "[observe-dogfood] OTEL →",
    base,
    `project=${target.projectId}`,
  )
}

export async function shutdownDogfoodOtel(): Promise<void> {
  const state = otelState()
  const sdk = state.sdk
  if (!sdk) {
    state.started = false
    return
  }
  await sdk.shutdown().catch(() => undefined)
  state.sdk = null
  state.started = false
}

/** Emit an OTEL log record (no-op if SDK not started). */
export function dogfoodLog(
  body: string,
  severity: "debug" | "info" | "warn" | "error" = "info",
) {
  if (!otelState().started) return
  const severityNumber =
    severity === "error"
      ? 17
      : severity === "warn"
        ? 13
        : severity === "debug"
          ? 5
          : 9
  logs.getLogger("deplow.dogfood").emit({
    severityNumber,
    severityText: severity.toUpperCase(),
    body,
    attributes: { "deplow.dogfood": "1" },
  })
}
