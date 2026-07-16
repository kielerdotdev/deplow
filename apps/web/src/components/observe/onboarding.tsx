import { useEffect, useState } from "react"
import { CopyIcon, RadioIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { client } from "@/lib/orpc"
import { cn } from "@/lib/utils"

type SetupPayload = {
  dsn: string
  otelEndpoint: string
  snippet: string
}

/**
 * Centered ingest onboarding when a project has not received telemetry yet.
 */
export function ObserveOnboarding({
  projectId,
  className,
}: {
  projectId: string
  className?: string
}) {
  const [setup, setSetup] = useState<SetupPayload | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
  }, [projectId])

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value)
    setCopied(label)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div
      className={cn(
        "flex min-h-[min(28rem,60vh)] flex-1 flex-col items-center justify-center px-4 py-10",
        className,
      )}
    >
      <div className="w-full max-w-lg surface-panel p-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="icon-well size-9 shrink-0">
            <RadioIcon className="size-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Send your first telemetry
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Point your Sentry SDK or OpenTelemetry exporter at this project.
              Surfaces fill in once data arrives.
            </p>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !setup ? (
          <p className="text-sm text-muted-foreground">Loading credentials…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <Credential
              label="SENTRY_DSN"
              value={setup.dsn}
              copied={copied === "dsn"}
              onCopy={() => void copy("dsn", setup.dsn)}
            />
            <Credential
              label="OTEL endpoint"
              value={setup.otelEndpoint}
              copied={copied === "otel"}
              onCopy={() => void copy("otel", setup.otelEndpoint)}
            />
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Node snippet
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2"
                  onClick={() => void copy("snippet", setup.snippet)}
                >
                  <CopyIcon className="size-3.5" />
                  {copied === "snippet" ? "Copied" : "Copy"}
                </Button>
              </div>
              <pre className="max-h-40 overflow-auto rounded-lg border border-border/70 bg-muted/30 p-3 text-[11px] leading-relaxed">
                {setup.snippet}
              </pre>
            </div>
            <p className="text-xs text-muted-foreground">
              Deploys inject <code className="text-[10px]">SENTRY_DSN</code> and{" "}
              <code className="text-[10px]">OTEL_*</code> automatically when
              Observe is enabled.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Credential({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2"
          onClick={onCopy}
        >
          <CopyIcon className="size-3.5" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <code className="block break-all rounded-lg border border-border/70 bg-muted/30 p-2.5 text-[11px]">
        {value}
      </code>
    </div>
  )
}
