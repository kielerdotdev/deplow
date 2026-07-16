import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router"
import { ChevronRightIcon, RocketIcon } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageContent, PageHeader } from "@/components/page-layout"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { useProjectUi } from "@/components/project-ui-context"
import {
  shortSha,
  triggerLabel,
} from "@/lib/service/deployment-status"
import { formatRelativeTime } from "@/lib/ui-format"

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
        description={`Recent deploys across ${project.name}.`}
      />
      <PageContent width="wide">
        {deployments.length === 0 ? (
          <EmptyState
            icon={RocketIcon}
            title="No deployments yet"
            description="Add a service from Git, then deploy it to see history here."
            action={
              <Button size="sm" onClick={openAddService}>
                Add service
              </Button>
            }
          />
        ) : (
          <div className="surface-panel divide-y divide-border">
            {deployments.map((d) => {
              const sha = "gitSha" in d && d.gitSha ? shortSha(String(d.gitSha)) : null
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
                  className="group flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={d.status} context="deployment" />
                      <span className="text-sm font-medium">
                        {d.serviceName}
                      </span>
                      {sha ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {sha}
                        </span>
                      ) : null}
                    </div>
                    <p
                      className="text-xs text-muted-foreground"
                      title={d.createdAt}
                    >
                      {[
                        "gitBranch" in d && d.gitBranch
                          ? String(d.gitBranch)
                          : null,
                        "triggeredBy" in d
                          ? triggerLabel(
                              d.triggeredBy as string | null | undefined,
                            )
                          : null,
                        formatRelativeTime(d.createdAt),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {d.errorMessage ? (
                      <p className="line-clamp-1 text-xs text-destructive">
                        {d.errorMessage}
                      </p>
                    ) : null}
                  </div>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" />
                </Link>
              )
            })}
          </div>
        )}
      </PageContent>
    </>
  )
}
