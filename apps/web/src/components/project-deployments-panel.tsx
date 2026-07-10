import { RocketIcon } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatDateTime, summarizeDeployError } from "@/lib/ui-format"

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
      <Card>
        <EmptyState
          icon={RocketIcon}
          title="No deployments yet"
          description="Deploy source to go live. History will show up here."
          action={
            <Button onClick={onOpenDeploy}>
              <RocketIcon data-icon="inline-start" />
              Deploy
            </Button>
          }
        />
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deployments</CardTitle>
        <CardDescription>Recent deploys for this project.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {deployments.map((d) => (
          <div
            key={d.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(d.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelect(d.id)
            }}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3 transition-colors ${
              selectedId === d.id
                ? "border-primary/40 bg-accent/40"
                : "border-border/80 hover:bg-muted/40"
            }`}
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={d.status} />
                <span className="font-mono text-xs text-muted-foreground">
                  {d.id.slice(0, 8)}
                </span>
                {d.triggeredBy ? (
                  <span className="text-xs text-muted-foreground">
                    via {d.triggeredBy}
                  </span>
                ) : null}
              </div>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {d.buildStrategy ? `${d.buildStrategy} · ` : ""}
                {d.image || "—"}
              </p>
              {d.errorMessage ? (
                <p className="text-xs text-destructive">
                  {summarizeDeployError(d.errorMessage)}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {formatDateTime(d.createdAt)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onViewLogs(d)
                }}
              >
                View logs
              </Button>
              {d.status === "failed" ? (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRetry(d.id)
                  }}
                >
                  Retry
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
