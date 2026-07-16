import { Link } from "@tanstack/react-router"
import { ChevronRightIcon, LinkIcon } from "lucide-react"

import { DeploymentRow, type DeploymentRowData } from "@/components/service/deployment-row"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  isDeploymentInProgress,
  shortSha,
  triggerLabel,
} from "@/lib/service/deployment-status"
import { formatRelativeTime } from "@/lib/ui-format"

type GitLike = {
  connected: boolean
  provider?: string | null
  repoFullName?: string | null
  repoUrl?: string | null
  branch?: string | null
}

export function ServiceOverview({
  projectId,
  serviceId,
  serviceStatus,
  publicUrl,
  isApp,
  git,
  deployments,
  onCancel,
  pending,
}: {
  projectId: string
  serviceId: string
  serviceStatus: string
  publicUrl?: string | null
  isApp: boolean
  git: GitLike
  deployments: DeploymentRowData[]
  onCancel?: (deploymentId: string) => void
  pending?: boolean
}) {
  const latest = deployments[0] ?? null
  const inProgress = latest && isDeploymentInProgress(latest.status)
  const sha = latest ? shortSha(latest.gitSha) : null
  const sourceLabel = git.connected
    ? [
        git.provider === "gitlab" ? "GitLab" : "GitHub",
        git.repoFullName || git.repoUrl,
        git.branch,
      ]
        .filter(Boolean)
        .join(" · ")
    : "No repository connected"

  return (
    <div className="flex flex-col gap-4">
      {isApp && latest ? (
        <Link
          to="/projects/$projectId/services/$serviceId/deployments/$deploymentId"
          params={{
            projectId,
            serviceId,
            deploymentId: latest.id,
          }}
          className="surface-panel group flex flex-col gap-3 p-4 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-muted-foreground">
                {inProgress ? "Deployment in progress" : "Latest deployment"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={latest.status} context="deployment" />
                <span className="font-mono text-sm font-medium">
                  {sha ?? latest.id.slice(0, 8)}
                  {latest.gitBranch ? ` · ${latest.gitBranch}` : ""}
                </span>
              </div>
              <p
                className="text-sm text-muted-foreground"
                title={latest.createdAt}
              >
                {latest.status === "failed"
                  ? `Failed${latest.failedStage ? ` during ${latest.failedStage}` : ""} · `
                  : ""}
                {triggerLabel(latest.triggeredBy)} ·{" "}
                {formatRelativeTime(latest.createdAt)}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground">
              View deployment
              <ChevronRightIcon className="size-4" />
            </span>
          </div>
          {inProgress && onCancel ? (
            <div className="flex gap-2" onClick={(e) => e.preventDefault()}>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onCancel(latest.id)
                }}
              >
                Cancel
              </Button>
            </div>
          ) : null}
        </Link>
      ) : isApp ? (
        <div className="surface-panel p-4 text-sm text-muted-foreground">
          No deployments yet. Deploy from Git to create the first release.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="surface-panel flex flex-col gap-2 p-4">
          <p className="text-xs text-muted-foreground">Service health</p>
          <StatusBadge status={serviceStatus} context="service" />
        </div>
        <div className="surface-panel flex flex-col gap-2 p-4">
          <p className="text-xs text-muted-foreground">Public URL</p>
          {publicUrl ? (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-sm hover:underline"
            >
              <LinkIcon className="size-3.5 text-muted-foreground" />
              {publicUrl.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">
              No public URL yet.{" "}
              <Link
                to="/projects/$projectId/services/$serviceId"
                params={{ projectId, serviceId }}
                search={{ tab: "settings", section: "domains" }}
                className="underline hover:text-foreground"
              >
                Configure domains
              </Link>
              {serviceStatus !== "running" ? " or deploy first." : "."}
            </p>
          )}
        </div>
      </div>

      {isApp ? (
        <div className="surface-panel flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Source</p>
            <p className="truncate text-sm">{sourceLabel}</p>
          </div>
          <Link
            to="/projects/$projectId/services/$serviceId"
            params={{ projectId, serviceId }}
            search={{ tab: "settings", section: "source" }}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Configure source
          </Link>
        </div>
      ) : null}

      {isApp && deployments.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Recent deployments</p>
            <Link
              to="/projects/$projectId/services/$serviceId"
              params={{ projectId, serviceId }}
              search={{ tab: "deployments" }}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              View all
            </Link>
          </div>
          <div className="surface-panel divide-y divide-border">
            {deployments.slice(0, 5).map((d) => (
              <DeploymentRow
                key={d.id}
                projectId={projectId}
                serviceId={serviceId}
                deployment={d}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
