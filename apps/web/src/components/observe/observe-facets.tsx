import { Button } from "@/components/ui/button"
import type { ObserveContext, SpanScope } from "@/lib/observe/context"
import { cn } from "@/lib/utils"

const SCOPES: Array<{ id: SpanScope; label: string; title: string }> = [
  {
    id: "root",
    label: "Root",
    title: "Root spans — one row per complete operation",
  },
  {
    id: "all",
    label: "All",
    title: "Any matching span in the trace",
  },
  {
    id: "entrypoint",
    label: "Entrypoint",
    title:
      "SERVER / CONSUMER spans where external work enters a service. May not be the distributed-trace root.",
  },
]

const DURATIONS: Array<{ ms: number | undefined; label: string }> = [
  { ms: undefined, label: "Any duration" },
  { ms: 100, label: ">100ms" },
  { ms: 500, label: ">500ms" },
  { ms: 1000, label: ">1s" },
  { ms: 5000, label: ">5s" },
]

function spanScopeStorageKey(projectId?: string) {
  return projectId
    ? `observe.spanScope.${projectId}`
    : "observe.spanScope"
}

/** Compact surface facets (traces/explore) — lives inside ContextBar. */
export function ObserveFacets({
  context,
  onChange,
  className,
  projectId,
}: {
  context: ObserveContext
  onChange: (next: ObserveContext) => void
  className?: string
  projectId?: string
}) {
  const scope = context.query.spanScope ?? "root"
  const errorsOnly = context.query.errorsOnly === true
  const minDurationMs = context.query.minDurationMs

  function patchQuery(patch: Partial<ObserveContext["query"]>) {
    if (patch.spanScope) {
      try {
        localStorage.setItem(spanScopeStorageKey(projectId), patch.spanScope)
      } catch {
        /* ignore */
      }
    }
    onChange({
      ...context,
      query: { ...context.query, ...patch },
    })
  }

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      data-testid="observe-facets"
    >
      <div className="inline-flex rounded-md border border-border p-0.5">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            title={s.title}
            className={cn(
              "min-h-9 rounded-[3px] px-2.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              scope === s.id
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => patchQuery({ spanScope: s.id })}
          >
            {s.label}
          </button>
        ))}
      </div>

      <Button
        size="sm"
        variant={errorsOnly ? "default" : "outline"}
        className={cn(
          "h-9 text-[11px]",
          errorsOnly &&
            "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        )}
        onClick={() =>
          patchQuery({ errorsOnly: errorsOnly ? undefined : true })
        }
      >
        Errors
      </Button>

      <div className="inline-flex rounded-md border border-border p-0.5">
        {DURATIONS.map((d) => {
          const active =
            minDurationMs === d.ms ||
            (d.ms == null && minDurationMs == null)
          return (
            <button
              key={d.label}
              type="button"
              title={d.ms == null ? "Any duration" : `Duration ${d.label}`}
              className={cn(
                "min-h-9 rounded-[3px] px-2.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => patchQuery({ minDurationMs: d.ms })}
            >
              {d.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function spanColumnHeader(scope: SpanScope | undefined): string {
  const s = scope ?? "root"
  if (s === "entrypoint") return "Entrypoint"
  if (s === "all") return "Span"
  return "Root span"
}
