import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router"
import { GitCommitHorizontalIcon, GitMergeIcon, RocketIcon } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import {
  PageContent,
  PageHeader,
  PanelActionButton,
} from "@/components/page-layout"
import { StatusDot } from "@/components/status-dot"
import { useProjectUi } from "@/components/project-ui-context"
import {
  deploymentStatusLabel,
  shortSha,
  triggerLabel,
} from "@/lib/service/deployment-status"
import { formatRelativeTime } from "@/lib/ui-format"
import { cn } from "@/lib/utils"

const projectRoute = getRouteApi("/projects/$projectId")

export const Route = createFileRoute("/projects/$projectId/deployments")({
  component: ProjectDeploymentsPage,
})

function ProjectDeploymentsPage() {
  const { project, deployments } = projectRoute.useLoaderData()
  const { openAddService } = useProjectUi()

  return (
    <>
      <PageHeader
        title="Deployments"
        description={`Automatically created for pushes to ${project.name}`}
        actions={
          <PanelActionButton onClick={openAddService}>
            Create deployment
          </PanelActionButton>
        }
      />
      <PageContent width="flush">
        {deployments.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={RocketIcon}
              title="No deployments yet"
              description="Add a service from Git, then deploy it to see history here."
              action={
                <PanelActionButton onClick={openAddService}>
                  Add service
                </PanelActionButton>
              }
            />
          </div>
        ) : (
          <div className="relative min-h-0 flex-1 overflow-auto">
            {deployments.map((d) => {
              const sha =
                "gitSha" in d && d.gitSha ? shortSha(String(d.gitSha)) : null
              const branch =
                "gitBranch" in d && d.gitBranch ? String(d.gitBranch) : null
              const label =
                deploymentStatusLabel[d.status] ??
                d.status.charAt(0).toUpperCase() + d.status.slice(1)
              const message =
                d.errorMessage?.trim() ||
                ("gitMessage" in d && d.gitMessage
                  ? String(d.gitMessage)
                  : null) ||
                d.serviceName

              return (
                <Link
                  key={d.id}
                  to="/projects/$projectId/services/$serviceId/deployments/$deploymentId"
                  params={{
                    projectId: project.id,
                    serviceId: d.serviceId,
                    deploymentId: d.id,
                  }}
                  search={{ view: "summary" }}
                  className={cn(
                    "grid h-12 w-full min-w-0 cursor-pointer items-center gap-3 overflow-hidden border-b border-border/60 px-2 text-[14px] font-medium",
                    "grid-cols-[minmax(0,152px)_minmax(0,128px)_minmax(240px,1fr)_140px_112px]",
                    "transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:bg-foreground/[0.04]",
                  )}
                >
                  <div className="flex min-w-0 items-center px-2">
                    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                      <StatusDot status={d.status} />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium leading-5 text-foreground">
                        {label}
                      </span>
                    </span>
                  </div>

                  <div className="flex min-w-0 items-center gap-1 overflow-hidden px-2 text-foreground">
                    <GitMergeIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{branch ?? "—"}</span>
                  </div>

                  <div className="flex min-w-0 items-center gap-2 overflow-hidden px-2">
                    {sha ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <GitCommitHorizontalIcon className="size-4 shrink-0 text-shell-faint" />
                        <span className="shrink-0 font-mono text-muted-foreground">
                          {sha}
                        </span>
                      </div>
                    ) : null}
                    <span className="min-w-0 truncate text-foreground">
                      {message}
                    </span>
                  </div>

                  <div className="flex min-w-0 items-center gap-1.5 px-2">
                    <span className="min-w-0 truncate text-muted-foreground">
                      {"triggeredBy" in d
                        ? triggerLabel(
                            d.triggeredBy as string | null | undefined,
                          )
                        : "—"}
                    </span>
                  </div>

                  <div className="min-w-0 px-2 text-right text-[14px] font-medium tabular-nums text-muted-foreground">
                    <span className="block truncate">
                      {formatRelativeTime(d.createdAt)}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </PageContent>
    </>
  )
}
