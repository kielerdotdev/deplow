import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router"
import { RocketIcon } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { PageContent, PageHeader } from "@/components/page-layout"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { useProjectUi } from "@/components/project-ui-context"

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
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Service</th>
                  <th className="hidden px-3 py-2.5 font-medium sm:table-cell">
                    When
                  </th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {deployments.map((d) => (
                  <tr
                    key={d.id}
                    className="transition-colors hover:bg-muted/30"
                  >
                    <td className="px-3 py-3">
                      <Link
                        to="/projects/$projectId/services/$serviceId"
                        params={{
                          projectId: project.id,
                          serviceId: d.serviceId,
                        }}
                        search={{ tab: "deployments" }}
                        className="font-medium hover:underline"
                      >
                        {d.serviceName}
                      </Link>
                      {"gitSha" in d && d.gitSha ? (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {String(d.gitSha).slice(0, 7)}
                        </span>
                      ) : null}
                      {d.errorMessage ? (
                        <p className="mt-0.5 text-xs text-destructive">
                          {d.errorMessage}
                        </p>
                      ) : null}
                    </td>
                    <td className="hidden px-3 py-3 text-muted-foreground sm:table-cell">
                      {d.createdAt}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={d.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageContent>
    </>
  )
}
