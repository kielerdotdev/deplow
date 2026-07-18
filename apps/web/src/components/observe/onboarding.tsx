import { useCallback, useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import {
  Loader2Icon,
  RadioIcon,
  RefreshCwIcon,
  CheckCircle2Icon,
} from "lucide-react"

import { CodeSnippet } from "./code-snippet"
import { CopyableField } from "./copyable-field"
import { InfoCallout } from "./info-callout"
import { Button } from "@/components/ui/button"
import { client } from "@/lib/orpc"
import { cn } from "@/lib/utils"

type SetupPayload = {
  dsn: string
  otelEndpoint: string
  otelHeaders?: string
  snippet: string
}

type IntegrationMethod = "sentry" | "otel" | "manual"

const METHODS: Array<{
  id: IntegrationMethod
  label: string
  description: string
}> = [
  {
    id: "sentry",
    label: "Sentry SDK",
    description: "Errors and performance via Sentry-compatible ingest",
  },
  {
    id: "otel",
    label: "OpenTelemetry",
    description: "OTLP traces, metrics, and logs",
  },
  {
    id: "manual",
    label: "Manual",
    description: "Wire env vars or raw endpoints yourself",
  },
]

/**
 * First-class cold-start onboarding for Observe surfaces.
 * Aligns under the page header — not a centered modal.
 */
export function ObserveOnboarding({
  projectId,
  className,
  surface = "traces",
  /** Optional preloaded setup (tests / story harness). */
  initialSetup,
  /** Skip service polling when true (tests). */
  disablePolling = false,
  /**
   * Optional services list override (defaults to ORPC). Used in tests to
   * drive waiting vs success verification without a live backend.
   */
  listServices,
}: {
  projectId: string
  className?: string
  /** Which surface is waiting for data — affects verification copy. */
  surface?: "traces" | "logs" | "metrics" | "overview" | "issues"
  initialSetup?: SetupPayload | null
  disablePolling?: boolean
  listServices?: (args: {
    projectId: string
    from: string
    to: string
  }) => Promise<ReadonlyArray<{ last_seen?: string; lastSeen?: string }>>
}) {
  const [setup, setSetup] = useState<SetupPayload | null>(initialSetup ?? null)
  const [error, setError] = useState<string | null>(null)
  const [method, setMethod] = useState<IntegrationMethod>("sentry")
  const [verification, setVerification] = useState<
    "waiting" | "checking" | "received" | "error"
  >("waiting")
  const [lastSeen, setLastSeen] = useState<string | null>(null)

  useEffect(() => {
    if (initialSetup) {
      setSetup(initialSetup)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        await client.observe.projects.enable({ projectId }).catch(() => null)
        const data = await client.observe.projects.setup({ projectId })
        if (!cancelled) setSetup(data)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load setup")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, initialSetup])

  const checkTelemetry = useCallback(async () => {
    setVerification("checking")
    try {
      const from = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString()
      const to = new Date().toISOString()
      let services: ReadonlyArray<{ last_seen?: string; lastSeen?: string }> =
        []
      try {
        if (listServices) {
          services = await listServices({ projectId, from, to })
        } else {
          services = (await client.observe.services.list({
            projectId,
            from,
            to,
          })) as ReadonlyArray<{ last_seen?: string; lastSeen?: string }>
        }
      } catch {
        services = []
      }
      if (Array.isArray(services) && services.length > 0) {
        const first = services[0]
        setLastSeen(
          first?.last_seen ?? first?.lastSeen ?? new Date().toISOString(),
        )
        setVerification("received")
        return
      }
      setVerification("waiting")
    } catch {
      setVerification("error")
    }
  }, [projectId, listServices])

  useEffect(() => {
    if (disablePolling) {
      setVerification("waiting")
      return
    }
    void checkTelemetry()
    const id = window.setInterval(() => void checkTelemetry(), 12_000)
    return () => window.clearInterval(id)
  }, [checkTelemetry, disablePolling])

  const signalLabel =
    surface === "logs"
      ? "logs"
      : surface === "metrics"
        ? "metrics"
        : surface === "issues"
          ? "error events"
          : "traces"

  return (
    <div
      data-testid="observe-onboarding"
      className={cn(
        "flex w-full flex-col gap-6",
        /* Align to content grid; never vertically center in the viewport */
        "max-w-4xl",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="icon-well size-10 shrink-0">
          <RadioIcon className="size-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Send your first telemetry
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Point your SDK or OpenTelemetry exporter at this project.{" "}
            {signalLabel.charAt(0).toUpperCase() + signalLabel.slice(1)} appear
            here once data is ingested.
          </p>
        </div>
      </div>

      {error ? (
        <InfoCallout variant="warning" title="Could not load setup credentials">
          {error}
        </InfoCallout>
      ) : !setup ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
          Loading credentials…
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,18rem)] lg:items-start">
          <div className="min-w-0 space-y-6">
            {/* Step 1: method */}
            <section className="space-y-3" aria-labelledby="onboard-method">
              <StepHeading step={1} id="onboard-method">
                Choose an integration method
              </StepHeading>
              <div
                role="tablist"
                aria-label="Integration method"
                className="grid gap-2 sm:grid-cols-3"
                data-testid="onboarding-method-tabs"
              >
                {METHODS.map((m) => {
                  const selected = method === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setMethod(m.id)}
                      className={cn(
                        "flex min-h-16 flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "border-foreground/25 bg-card shadow-sm"
                          : "border-border bg-muted/20 hover:bg-muted/40",
                      )}
                    >
                      <span
                        className={cn(
                          "text-sm font-medium",
                          selected ? "text-foreground" : "text-foreground/90",
                        )}
                      >
                        {m.label}
                      </span>
                      <span className="text-xs leading-snug text-muted-foreground">
                        {m.description}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Step 2: configure */}
            <section className="space-y-3" aria-labelledby="onboard-configure">
              <StepHeading step={2} id="onboard-configure">
                Configure the endpoint
              </StepHeading>

              {method === "sentry" ? (
                <div className="space-y-3">
                  <CopyableField label="SENTRY_DSN" value={setup.dsn} />
                  <CodeSnippet
                    languages={[
                      {
                        id: "node",
                        label: "Node.js",
                        code: setup.snippet,
                      },
                      {
                        id: "browser",
                        label: "Browser",
                        code: `import * as Sentry from "@sentry/browser";\n\nSentry.init({\n  dsn: "${setup.dsn}",\n  tracesSampleRate: 0.1,\n});\n`,
                      },
                      {
                        id: "python",
                        label: "Python",
                        code: `import sentry_sdk\n\nsentry_sdk.init(\n    dsn="${setup.dsn}",\n    traces_sample_rate=0.1,\n)\n`,
                      },
                    ]}
                  />
                  <InfoCallout variant="info" title="Deploy injects credentials">
                    When Observe is enabled, deploys automatically inject{" "}
                    <code>SENTRY_DSN</code> and <code>OTEL_*</code> environment
                    variables into services — you may not need to paste these by
                    hand.
                  </InfoCallout>
                </div>
              ) : null}

              {method === "otel" ? (
                <div className="space-y-3">
                  <CopyableField
                    label="OTLP endpoint"
                    value={setup.otelEndpoint}
                  />
                  {setup.otelHeaders ? (
                    <CopyableField
                      label="OTLP headers"
                      value={setup.otelHeaders}
                    />
                  ) : null}
                  <CodeSnippet
                    languages={[
                      {
                        id: "env",
                        label: "Environment",
                        code: `export OTEL_EXPORTER_OTLP_ENDPOINT="${setup.otelEndpoint}"\nexport OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf"\n${setup.otelHeaders ? `export OTEL_EXPORTER_OTLP_HEADERS="${setup.otelHeaders}"\n` : ""}`,
                      },
                      {
                        id: "node",
                        label: "Node SDK",
                        code: `// Point your OTLP HTTP exporter at:\n// ${setup.otelEndpoint}\n// Include project auth headers if required.\n`,
                      },
                    ]}
                  />
                  <InfoCallout variant="info" title="Deploy injects credentials">
                    Services deployed through Hostrig receive{" "}
                    <code>OTEL_EXPORTER_OTLP_ENDPOINT</code> automatically when
                    Observe is enabled.
                  </InfoCallout>
                </div>
              ) : null}

              {method === "manual" ? (
                <div className="space-y-3">
                  <CopyableField label="SENTRY_DSN" value={setup.dsn} />
                  <CopyableField
                    label="OTEL endpoint"
                    value={setup.otelEndpoint}
                  />
                  {setup.otelHeaders ? (
                    <CopyableField
                      label="Auth header"
                      value={setup.otelHeaders}
                    />
                  ) : null}
                  <InfoCallout variant="troubleshooting" title="Manual wiring">
                    Paste these values into your agent, collector, or CI secrets.
                    Ingestion is project-scoped via the DSN / OTLP path.
                  </InfoCallout>
                </div>
              ) : null}
            </section>

            {/* Step 3: send */}
            <section className="space-y-3" aria-labelledby="onboard-send">
              <StepHeading step={3} id="onboard-send">
                Send telemetry
              </StepHeading>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Trigger a request, error, or span in your app. Ingestion usually
                shows up within a few seconds; cold starts can take up to a
                minute.
              </p>
            </section>
          </div>

          {/* Step 4: verify — side column on large screens */}
          <aside
            className="space-y-3 lg:sticky lg:top-16"
            aria-labelledby="onboard-verify"
            data-testid="onboarding-verification"
          >
            <StepHeading step={4} id="onboard-verify">
              Verify
            </StepHeading>

            {verification === "received" ? (
              <div
                className="rounded-lg border border-success/30 bg-success/8 p-4"
                data-testid="onboarding-verification-success"
              >
                <div className="flex items-start gap-2.5">
                  <CheckCircle2Icon
                    className="mt-0.5 size-4 shrink-0 text-success"
                    aria-hidden
                  />
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Telemetry received
                    </p>
                    {lastSeen ? (
                      <p className="text-xs text-muted-foreground">
                        Latest activity{" "}
                        <time dateTime={lastSeen}>
                          {new Date(lastSeen).toLocaleString()}
                        </time>
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        render={
                          <Link
                            to="/observe/projects/$projectId/traces"
                            params={{ projectId }}
                          />
                        }
                      >
                        Open traces
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void checkTelemetry()}
                      >
                        Refresh
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start gap-2.5">
                  {verification === "checking" ? (
                    <Loader2Icon
                      className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground"
                      aria-hidden
                    />
                  ) : (
                    <RadioIcon
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Waiting for {signalLabel}
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      We poll for services and spans automatically. After you
                      export, this panel updates without a full page reload.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => void checkTelemetry()}
                        disabled={verification === "checking"}
                      >
                        <RefreshCwIcon className="size-3.5" aria-hidden />
                        Check now
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <InfoCallout variant="troubleshooting" title="Nothing arriving?">
              Confirm the DSN host matches this instance, the project is
              enabled, and outbound traffic is allowed. Double-check sample
              rates are not zero.
            </InfoCallout>
          </aside>
        </div>
      )}
    </div>
  )
}

function StepHeading({
  step,
  id,
  children,
}: {
  step: number
  id: string
  children: React.ReactNode
}) {
  return (
    <h3
      id={id}
      className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground"
    >
      <span
        className="inline-flex size-6 shrink-0 items-center place-content-center rounded-full border border-border bg-muted/50 text-[11px] font-semibold tabular-nums text-foreground"
        aria-hidden
      >
        {step}
      </span>
      {children}
    </h3>
  )
}
