import { useEffect, useState } from "react"
import { CheckIcon, CircleIcon, XIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { client } from "@/lib/orpc"
import { cn } from "@/lib/utils"

type StepId = "dsn" | "event" | "trace"

type Step = {
  id: StepId
  label: string
  description: string
  done: boolean
}

function storageKey(projectId: string) {
  return `observe.setupChecklist.dismissed.${projectId}`
}

export function SetupChecklist({
  projectId,
  className,
}: {
  projectId: string
  className?: string
}) {
  const [dismissed, setDismissed] = useState(true)
  const [steps, setSteps] = useState<Step[] | null>(null)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(storageKey(projectId)) === "1")
    } catch {
      setDismissed(false)
    }
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [setup, issues, services] = await Promise.all([
          client.observe.projects.setup({ projectId }).catch(() => null),
          client.observe.issues
            .list({ projectId, status: "unresolved" })
            .catch(() => []),
          client.observe.services
            .list({
              projectId,
              from: new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString(),
              to: new Date().toISOString(),
            })
            .catch(() => []),
        ])
        if (cancelled) return
        const hasDsn = Boolean(setup?.dsn)
        const hasEvent = issues.length > 0
        const hasTrace = services.length > 0
        setSteps([
          {
            id: "dsn",
            label: "Configure DSN",
            description: "Copy the project DSN into your SDK",
            done: hasDsn,
          },
          {
            id: "event",
            label: "First error event",
            description: "Send a Sentry envelope or exception",
            done: hasEvent,
          },
          {
            id: "trace",
            label: "First trace",
            description: "Export OTLP traces to this project",
            done: hasTrace,
          },
        ])
      } catch {
        if (!cancelled) setSteps(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (dismissed || !steps) return null
  if (steps.every((s) => s.done)) return null

  return (
    <div
      className={cn(
        "surface-panel relative mb-4 p-4",
        className,
      )}
      data-testid="observe-setup-checklist"
    >
      <button
        type="button"
        className="absolute top-3 right-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Dismiss checklist"
        onClick={() => {
          try {
            localStorage.setItem(storageKey(projectId), "1")
          } catch {
            /* ignore */
          }
          setDismissed(true)
        }}
      >
        <XIcon className="size-3.5" />
      </button>
      <div className="mb-3 pr-8">
        <h3 className="text-sm font-semibold tracking-tight">Get started</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Complete these steps to light up Observe for this project.
        </p>
      </div>
      <ul className="space-y-2">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2.5 text-sm">
            {step.done ? (
              <span className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <CheckIcon className="size-3" />
              </span>
            ) : (
              <span className="mt-0.5 flex size-5 items-center justify-center text-muted-foreground">
                <CircleIcon className="size-3.5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "font-medium",
                  step.done && "text-muted-foreground line-through",
                )}
              >
                {step.label}
              </div>
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          render={
            <Link
              to="/observe/projects/$projectId"
              params={{ projectId }}
            />
          }
        >
          Overview
        </Button>
        <Button
          size="sm"
          variant="ghost"
          render={
            <Link
              to="/observe/projects/$projectId/traces"
              params={{ projectId }}
            />
          }
        >
          View traces
        </Button>
      </div>
    </div>
  )
}
