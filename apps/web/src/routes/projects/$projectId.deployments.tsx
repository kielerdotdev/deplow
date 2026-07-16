import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router"

import { PageContent, PageHeader } from "@/components/page-layout"
import { StatusBadge } from "@/components/status-badge"

const projectRoute = getRouteApi("/projects/$projectId")

export const Route = createFileRoute("/projects/$projectId/deployments")({
  component: ProjectDeploymentsPage,
})

function ProjectDeploymentsPage() {
  const { project, deployments } = projectRoute.useLoaderData()
  const router = useRouter()

  return (
    <>
      <PageHeader
        title="Deployments"
        description={`Recent deploys across ${project.name}.`}
      />
      <PageContent width="wide">
        <div className="surface-panel divide-y divide-border">
          {deployments.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              No deployments yet
            </p>
          ) : (
            deployments.map((d) => (
              <button
                key={d.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30"
                onClick={() =>
                  void router.navigate({
                    to: "/projects/$projectId/services/$serviceId",
                    params: {
                      projectId: project.id,
                      serviceId: d.serviceId,
                    },
                    search: { tab: "deployments" },
                  })
                }
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {d.serviceName}
                    {"gitSha" in d && d.gitSha ? (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {String(d.gitSha).slice(0, 7)}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {d.createdAt}
                    {d.errorMessage ? ` · ${d.errorMessage}` : ""}
                  </p>
                </div>
                <StatusBadge status={d.status} />
              </button>
            ))
          )}
        </div>
      </PageContent>
    </>
  )
}
