import { cn } from "@/lib/utils"

export function IssueHero({
  title,
  message,
  topFrame,
  level,
  className,
}: {
  title: string
  message?: string | null
  topFrame?: string | null
  level?: string | null
  className?: string
}) {
  return (
    <div className={cn("space-y-3", className)} data-testid="issue-hero">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Exception
          </div>
          {level ? (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                level.toLowerCase() === "error" ||
                  level.toLowerCase() === "fatal"
                  ? "bg-destructive/15 text-destructive"
                  : level.toLowerCase() === "warning" ||
                      level.toLowerCase() === "warn"
                    ? "bg-warning/15 text-warning"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {level}
            </span>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground break-words sm:text-3xl">
          {title}
        </h1>
        {message ? (
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {message}
          </p>
        ) : null}
      </div>
      {topFrame ? (
        <pre
          className={cn(
            "overflow-x-auto rounded-md border border-border/60 bg-muted/40 px-3 py-2",
            "font-mono text-[11px] leading-relaxed text-muted-foreground",
          )}
        >
          <code className="text-foreground/80">{topFrame}</code>
        </pre>
      ) : null}
    </div>
  )
}
