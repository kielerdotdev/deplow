import { useEffect, useRef } from "react"
import { RotateCcwIcon } from "lucide-react"

import { DeploymentTimeline } from "@/components/service/deployment-timeline"
import { LogViewer } from "@/components/log-viewer"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useLogStream } from "@/hooks/use-log-stream"
import { client } from "@/lib/orpc"
import {
  isBuildPhase,
  isDeploymentInProgress,
  shortSha,
  triggerLabel,
} from "@/lib/service/deployment-status"
import { formatDateTime, formatRelativeTime } from "@/lib/ui-format"
import { cn } from "@/lib/utils"

export type DeploymentDetailView =
  | "summary"
  | "build-logs"
  | "runtime-logs"
  | "events"

type DeploymentDetail = {
  id: string
  status: string
  gitSha?: string | null
  gitBranch?: string | null
  triggeredBy?: string | null
  buildStrategy?: string | null
  failedStage?: string | null
  errorMessage?: string | null
  image?: string | null
  createdAt: string
  updatedAt?: string
  operationId?: string | null
  failure?: {
    stage: string | null
    rootCause: string | null
    symptom: string | null
  } | null
}

type OperationLike = {
  id: string
  type: string
  status: string
  stage?: string | null
  createdAt: string
  updatedAt?: string
  rootCause?: string | null
  symptom?: string | null
}

const VIEWS: Array<{ id: DeploymentDetailView; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "build-logs", label: "Build logs" },
  { id: "runtime-logs", label: "Runtime logs" },
  { id: "events", label: "Events" },
]

export function DeploymentDetailNav({
  view,
  onChange,
}: {
  view: DeploymentDetailView
  onChange: (view: DeploymentDetailView) => void
}) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border pb-px">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => onChange(v.id)}
          className={cn(
            "px-3 py-2 text-sm",
            view === v.id
              ? "border-b-2 border-foreground font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v.label}
        </button>
      ))}
    </nav>
  )
}

export function DeploymentSummaryPanel({
  deployment,
  pending,
  onRetry,
  onStop,
}: {
  deployment: DeploymentDetail
  pending?: boolean
  onRetry?: () => void
  onStop?: () => void
}) {
  const sha = shortSha(deployment.gitSha)
  const inProgress = isDeploymentInProgress(deployment.status)

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <div className="surface-panel p-4">
        <p className="mb-3 text-xs text-muted-foreground">Progress</p>
        <DeploymentTimeline status={deployment.status} />
      </div>
      <div className="flex flex-col gap-4">
        <div className="surface-panel flex flex-col gap-3 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={deployment.status} context="deployment" />
            <span className="font-mono font-medium">
              {sha ?? deployment.id.slice(0, 8)}
            </span>
          </div>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Branch</dt>
              <dd>{deployment.gitBranch || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Trigger</dt>
              <dd>{triggerLabel(deployment.triggeredBy)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Builder</dt>
              <dd className="capitalize">
                {deployment.buildStrategy || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Created</dt>
              <dd title={deployment.createdAt}>
                {formatRelativeTime(deployment.createdAt)} ·{" "}
                {formatDateTime(deployment.createdAt)}
              </dd>
            </div>
            {deployment.image ? (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Image</dt>
                <dd className="break-all font-mono text-xs">
                  {deployment.image}
                </dd>
              </div>
            ) : null}
          </dl>
          {deployment.status === "queued" || deployment.status === "pending" ? (
            <p className="text-sm text-muted-foreground">
              This deployment is queued. Build logs will appear when a worker
              becomes available.
            </p>
          ) : null}
          {deployment.failure?.rootCause || deployment.errorMessage ? (
            <Alert variant="destructive">
              <AlertDescription>
                <p className="font-medium">
                  {deployment.failure?.stage
                    ? `Failed at ${deployment.failure.stage}`
                    : deployment.failedStage
                      ? `Failed at ${deployment.failedStage}`
                      : "Deployment failed"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs">
                  {deployment.failure?.rootCause ||
                    deployment.errorMessage ||
                    deployment.failure?.symptom}
                </p>
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {deployment.status === "failed" && onRetry ? (
              <Button
                size="sm"
                disabled={pending}
                onClick={onRetry}
              >
                <RotateCcwIcon data-icon="inline-start" />
                Retry
              </Button>
            ) : null}
            {inProgress && onStop ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={onStop}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export function DeploymentLogsPanel({
  serviceId,
  deploymentId,
  deploymentStatus,
  kind,
  onSettled,
}: {
  serviceId: string
  deploymentId: string
  deploymentStatus: string
  kind: "build" | "runtime"
  onSettled?: () => void
}) {
  const queued =
    kind === "build" &&
    (deploymentStatus === "queued" || deploymentStatus === "pending")

  const logStream = useLogStream<{ phase: string | null }>({
    enabled: !queued,
    watchKey: `${kind}:${deploymentId}`,
    intervalMs: 1200,
    fetch: async () => {
      const result = await client.deployments.logs({
        serviceId,
        deploymentId,
      })
      const body =
        kind === "build"
          ? result.buildLogs || ""
          : result.logs || ""
      return {
        body,
        live: Boolean(result.live) && isDeploymentInProgress(result.deploymentStatus ?? ""),
        meta: { phase: result.phase },
      }
    },
  })

  const wasLive = useRef(false)
  useEffect(() => {
    if (wasLive.current && !logStream.live) onSettled?.()
    wasLive.current = logStream.live
  }, [logStream.live, onSettled])

  if (queued) {
    return (
      <div className="surface-panel p-6 text-sm text-muted-foreground">
        This deployment is queued. Build logs will appear when a worker becomes
        available.
      </div>
    )
  }

  const empty =
    kind === "runtime" && isBuildPhase(deploymentStatus)
      ? "Runtime logs are available after the build finishes."
      : kind === "build"
        ? "No build output yet."
        : "No runtime output yet."

  return (
    <div className="surface-panel p-4">
      {logStream.error ? (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{logStream.error}</AlertDescription>
        </Alert>
      ) : null}
      <LogViewer
        title={
          kind === "build"
            ? `Build logs · ${deploymentStatus}`
            : `Runtime logs · ${deploymentStatus}`
        }
        body={logStream.body}
        live={logStream.live}
        loading={logStream.loading}
        empty={empty}
      />
    </div>
  )
}

export function DeploymentEventsPanel({
  operation,
}: {
  operation: OperationLike | null
}) {
  if (!operation) {
    return (
      <div className="surface-panel p-6 text-sm text-muted-foreground">
        No linked operation events for this deployment.
      </div>
    )
  }

  return (
    <div className="surface-panel divide-y divide-border">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div>
          <p className="text-sm font-medium capitalize">{operation.type}</p>
          <p className="text-xs text-muted-foreground">
            {operation.stage ? `Stage: ${operation.stage}` : "Operation"}
          </p>
        </div>
        <StatusBadge status={operation.status} />
      </div>
      <div className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Created</p>
          <p title={operation.createdAt}>
            {formatRelativeTime(operation.createdAt)}
          </p>
        </div>
        {operation.updatedAt ? (
          <div>
            <p className="text-xs text-muted-foreground">Updated</p>
            <p title={operation.updatedAt}>
              {formatRelativeTime(operation.updatedAt)}
            </p>
          </div>
        ) : null}
      </div>
      {operation.rootCause || operation.symptom ? (
        <div className="px-4 py-3 text-sm">
          <p className="text-xs text-muted-foreground">Details</p>
          <p className="mt-1 whitespace-pre-wrap text-xs">
            {operation.rootCause || operation.symptom}
          </p>
        </div>
      ) : null}
    </div>
  )
}
