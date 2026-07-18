import { GitCommitHorizontalIcon, RocketIcon } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { SoftHit } from "@/components/soft-hit"
import { StatusDot } from "@/components/status-dot"
import { formatRelativeTime, summarizeDeployError } from "@/lib/ui-format"
import { cn } from "@/lib/utils"

export type DeployRow = {
  id: string
  status: string
  nodeId: string
  serviceName: string
  buildStrategy?: string | null
  image?: string | null
  buildLogs?: string | null
  errorMessage?: string | null
  triggeredBy?: string | null
  createdAt: string
}

export function DeploymentsPanel({
  deployments,
  selectedId,
  pending,
  onSelect,
  onViewLogs,
  onRetry,
  onOpenDeploy,
}: {
  deployments: DeployRow[]
  selectedId: string | null
  pending: boolean
  onSelect: (id: string) => void
  onViewLogs: (d: DeployRow) => void
  onRetry: (id: string) => void
  onOpenDeploy: () => void
}) {
  if (deployments.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={RocketIcon}
          title="No deployments yet"
          description="Deploy source to go live. History will show up here."
          action={
            <SoftHit as="button" tone="solid" onClick={onOpenDeploy}>
              <span className="flex h-8 items-center px-2 text-[14px] font-medium text-[#a1a1a1]">
                Deploy
              </span>
            </SoftHit>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-2">
        <div className="px-2 text-[14px] font-medium text-foreground">
          Deployments
        </div>
        <SoftHit as="button" tone="solid" onClick={onOpenDeploy}>
          <span className="flex h-8 items-center px-2 text-[14px] font-medium text-[#a1a1a1]">
            Create deployment
          </span>
        </SoftHit>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {deployments.map((d) => {
          const selected = selectedId === d.id
          const label =
            d.status.charAt(0).toUpperCase() + d.status.slice(1)
          return (
            <div
              key={d.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(d.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(d.id)
              }}
              className={cn(
                "grid h-12 w-full min-w-0 cursor-pointer items-center gap-3 overflow-hidden border-b border-border/60 px-2 text-[14px] font-medium",
                "grid-cols-[minmax(0,140px)_minmax(0,1fr)_112px]",
                "transition-colors hover:bg-foreground/[0.04]",
                selected && "bg-foreground/[0.04]",
              )}
            >
              <div className="flex min-w-0 items-center gap-1.5 px-2">
                <StatusDot status={d.status} />
                <span className="truncate text-foreground">{label}</span>
              </div>
              <div className="flex min-w-0 items-center gap-2 overflow-hidden px-2">
                <GitCommitHorizontalIcon className="size-4 shrink-0 text-shell-faint" />
                <span className="shrink-0 font-mono text-muted-foreground">
                  {d.id.slice(0, 7)}
                </span>
                <span className="min-w-0 truncate text-foreground">
                  {d.errorMessage
                    ? summarizeDeployError(d.errorMessage)
                    : d.serviceName}
                </span>
              </div>
              <div className="flex items-center justify-end gap-2 px-2">
                <span className="tabular-nums text-muted-foreground">
                  {formatRelativeTime(d.createdAt)}
                </span>
                {d.status === "failed" ? (
                  <button
                    type="button"
                    disabled={pending}
                    className="text-[13px] text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRetry(d.id)
                    }}
                  >
                    Retry
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-[13px] text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation()
                      onViewLogs(d)
                    }}
                  >
                    Logs
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
