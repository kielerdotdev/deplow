import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import { SparklesIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function storageKey(projectId: string) {
  return `observe.firstSignal.seen.${projectId}`
}

/**
 * One-shot banner after the project receives its first telemetry.
 * Parent passes `ready` when overview detects non-empty services/issues.
 */
export function FirstSignalCelebration({
  projectId,
  ready,
  className,
}: {
  projectId: string
  ready: boolean
  className?: string
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!ready) return
    try {
      if (localStorage.getItem(storageKey(projectId)) === "1") return
      setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [projectId, ready])

  if (!visible) return null

  function dismiss() {
    try {
      localStorage.setItem(storageKey(projectId), "1")
    } catch {
      /* ignore */
    }
    setVisible(false)
  }

  return (
    <div
      className={cn(
        "relative mb-4 flex flex-wrap items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3",
        className,
      )}
      data-testid="first-signal-celebration"
    >
      <div className="icon-well size-8 shrink-0">
        <SparklesIcon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1 pr-6">
        <h3 className="text-sm font-semibold tracking-tight">
          First signal received
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Telemetry is flowing. Open traces filtered to the last hour to inspect
          what just arrived.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            render={
              <Link
                to="/observe/projects/$projectId/traces"
                params={{ projectId }}
                search={{ t: "1h" }}
              />
            }
          >
            Open traces
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      </div>
      <button
        type="button"
        className="absolute top-2.5 right-2.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Dismiss"
        onClick={dismiss}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}
