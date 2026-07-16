import {
  DEPLOYMENT_STAGES,
  normalizeDeploymentStage,
  type DeploymentStage,
} from "@/lib/service/deployment-status"
import { cn } from "@/lib/utils"

const STAGE_LABEL: Record<DeploymentStage, string> = {
  queued: "Queued",
  analyzing: "Preparing",
  building: "Building",
  deploying: "Releasing",
  checking: "Health check",
  running: "Succeeded",
}

export function DeploymentTimeline({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const stage = normalizeDeploymentStage(status)
  const failed = status === "failed"
  const stopped = status === "stopped"
  const currentIndex =
    stage === "failed" || stage === "stopped"
      ? -1
      : DEPLOYMENT_STAGES.indexOf(stage)

  return (
    <ol className={cn("flex flex-col gap-2", className)}>
      {DEPLOYMENT_STAGES.map((s, index) => {
        const done =
          !failed &&
          !stopped &&
          (status === "running"
            ? true
            : currentIndex >= 0 && index < currentIndex)
        const current =
          !failed &&
          !stopped &&
          status !== "running" &&
          currentIndex === index
        const label = STAGE_LABEL[s]
        return (
          <li key={s} className="flex items-center gap-2.5 text-sm">
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                done &&
                  "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                current &&
                  "border-info/50 bg-info/15 text-info animate-pulse",
                !done &&
                  !current &&
                  "border-border text-muted-foreground",
              )}
              aria-hidden
            >
              {done ? "✓" : current ? "●" : "○"}
            </span>
            <span
              className={cn(
                current || done ? "text-foreground" : "text-muted-foreground",
                current && "font-medium",
              )}
            >
              {label}
            </span>
          </li>
        )
      })}
      {failed ? (
        <li className="flex items-center gap-2.5 text-sm text-destructive">
          <span
            className="flex size-5 shrink-0 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10 text-[10px]"
            aria-hidden
          >
            ✕
          </span>
          <span className="font-medium">Failed</span>
        </li>
      ) : null}
      {stopped ? (
        <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <span
            className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px]"
            aria-hidden
          >
            ■
          </span>
          <span>Stopped</span>
        </li>
      ) : null}
    </ol>
  )
}
