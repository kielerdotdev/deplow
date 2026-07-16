import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { ChevronRightIcon } from "lucide-react"

import { StatusBadge } from "@/components/status-badge"
import {
  shortSha,
  triggerLabel,
} from "@/lib/service/deployment-status"
import { formatRelativeTime } from "@/lib/ui-format"
import { cn } from "@/lib/utils"

export type DeploymentRowData = {
  id: string
  status: string
  gitSha?: string | null
  gitBranch?: string | null
  triggeredBy?: string | null
  buildStrategy?: string | null
  failedStage?: string | null
  errorMessage?: string | null
  createdAt: string
}

export function DeploymentRow({
  projectId,
  serviceId,
  deployment,
  actions,
  className,
}: {
  projectId: string
  serviceId: string
  deployment: DeploymentRowData
  actions?: ReactNode
  className?: string
}) {
  const sha = shortSha(deployment.gitSha)
  const title =
    sha ??
    `Deployment ${deployment.id.slice(0, 8)}`

  const meta = [
    sha,
    deployment.gitBranch,
    triggerLabel(deployment.triggeredBy),
  ]
    .filter(Boolean)
    .join(" · ")

  const when = formatRelativeTime(deployment.createdAt)
  const builder = deployment.buildStrategy
    ? `Builder: ${deployment.buildStrategy}`
    : null

  return (
    <div
      className={cn(
        "group relative flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40",
        className,
      )}
    >
      <Link
        to="/projects/$projectId/services/$serviceId/deployments/$deploymentId"
        params={{
          projectId,
          serviceId,
          deploymentId: deployment.id,
        }}
        className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`View deployment ${title}`}
      />
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col gap-1 pointer-events-none">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={deployment.status} context="deployment" />
          <span className="font-mono text-sm font-medium">{title}</span>
        </div>
        {meta ? (
          <p className="truncate text-xs text-muted-foreground">{meta}</p>
        ) : null}
        <p
          className="text-xs text-muted-foreground"
          title={deployment.createdAt}
        >
          {[when, builder].filter(Boolean).join(" · ")}
          {deployment.failedStage
            ? ` · failed at ${deployment.failedStage}`
            : ""}
        </p>
        {deployment.errorMessage ? (
          <p className="line-clamp-1 text-xs text-destructive">
            {deployment.errorMessage}
          </p>
        ) : null}
      </div>
      <div className="relative z-[1] flex items-center gap-2 pointer-events-auto">
        {actions}
        <ChevronRightIcon
          className="size-4 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 pointer-events-none"
          aria-hidden
        />
      </div>
    </div>
  )
}
