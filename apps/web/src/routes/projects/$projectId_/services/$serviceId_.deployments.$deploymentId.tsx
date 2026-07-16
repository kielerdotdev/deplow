import { useState } from "react"
import {
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { z } from "zod"

import { AppShell } from "@/components/app-shell"
import {
  DeploymentDetailNav,
  DeploymentEventsPanel,
  DeploymentLogsPanel,
  DeploymentSummaryPanel,
  type DeploymentDetailView,
} from "@/components/service/deployment-detail-panels"
import { ServiceHeader } from "@/components/service/service-header"
import { ServiceNav } from "@/components/service/service-nav"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import {
  defaultDeploymentView,
  shortSha,
} from "@/lib/service/deployment-status"
import { loadShellContext } from "@/lib/shell-context"

const searchSchema = z.object({
  view: z
    .enum(["summary", "build-logs", "runtime-logs", "events"])
    .optional()
    .catch(undefined),
})

export const Route = createFileRoute(
  "/projects/$projectId_/services/$serviceId_/deployments/$deploymentId",
)({
  validateSearch: (search) => searchSchema.parse(search),
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    const [shell, project, service, deployment] = await Promise.all([
      loadShellContext(),
      client.projects.get({ id: params.projectId }),
      client.services.get({ id: params.serviceId }),
      client.deployments.get({ id: params.deploymentId }),
    ])
    if (
      service.projectId !== project.id ||
      deployment.serviceId !== service.id ||
      deployment.projectId !== project.id
    ) {
      throw redirect({
        to: "/projects/$projectId/services/$serviceId",
        params: {
          projectId: params.projectId,
          serviceId: params.serviceId,
        },
        search: { tab: "deployments" },
      })
    }
    const operation = deployment.operationId
      ? await client.operations
          .get({ id: deployment.operationId })
          .catch(() => null)
      : null
    const deployments = await client.deployments.list({
      serviceId: service.id,
    })
    return {
      session,
      shell,
      project,
      service,
      deployment,
      operation,
      deployments,
    }
  },
  component: DeploymentDetailPage,
})

function DeploymentDetailPage() {
  const {
    session,
    shell,
    project,
    service,
    deployment,
    operation,
    deployments,
  } = Route.useLoaderData()
  const { view: viewParam } = Route.useSearch()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const view: DeploymentDetailView =
    viewParam ?? defaultDeploymentView(deployment.status)

  function setView(next: DeploymentDetailView) {
    void router.navigate({
      to: "/projects/$projectId/services/$serviceId/deployments/$deploymentId",
      params: {
        projectId: project.id,
        serviceId: service.id,
        deploymentId: deployment.id,
      },
      search: { view: next },
      replace: true,
    })
  }

  async function refresh() {
    await router.invalidate()
  }

  async function deploy() {
    setPending(true)
    setError(null)
    try {
      const created = await client.deployments.create({
        serviceId: service.id,
        fromGit: Boolean(service.git.connected),
      })
      await refresh()
      void router.navigate({
        to: "/projects/$projectId/services/$serviceId/deployments/$deploymentId",
        params: {
          projectId: project.id,
          serviceId: service.id,
          deploymentId: created.id,
        },
        search: { view: "build-logs" },
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  async function retry(deploymentId: string) {
    setPending(true)
    setError(null)
    try {
      const created = await client.deployments.retry({ id: deploymentId })
      await refresh()
      void router.navigate({
        to: "/projects/$projectId/services/$serviceId/deployments/$deploymentId",
        params: {
          projectId: project.id,
          serviceId: service.id,
          deploymentId: created.id,
        },
        search: { view: "build-logs" },
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  async function stop() {
    setPending(true)
    setError(null)
    try {
      await client.deployments.stop({ id: deployment.id })
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  const sha = shortSha(deployment.gitSha) ?? deployment.id.slice(0, 8)

  return (
    <AppShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      observeEnabled={shell.observeEnabled}
    >
      <div className="flex w-full flex-col gap-6">
        <ServiceHeader
          projectId={project.id}
          projectName={project.name}
          service={service}
          latestDeployment={deployments[0] ?? null}
          crumbExtra={sha}
          pending={pending}
          onDeploy={() => void deploy()}
          onRetry={(id) => void retry(id)}
          onViewDeployment={(id) =>
            void router.navigate({
              to: "/projects/$projectId/services/$serviceId/deployments/$deploymentId",
              params: {
                projectId: project.id,
                serviceId: service.id,
                deploymentId: id,
              },
              search: { view: "summary" },
            })
          }
        />

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <ServiceNav
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "deployments", label: "Deployments" },
            { id: "settings", label: "Settings" },
          ]}
          active="deployments"
          onChange={(tab) =>
            void router.navigate({
              to: "/projects/$projectId/services/$serviceId",
              params: { projectId: project.id, serviceId: service.id },
              search: { tab },
            })
          }
        />

        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-[-0.02em]">
            Deployment {sha}
          </h2>
          <p className="text-sm text-muted-foreground capitalize">
            {deployment.status}
            {deployment.gitBranch ? ` · ${deployment.gitBranch}` : ""}
          </p>
        </div>

        <DeploymentDetailNav view={view} onChange={setView} />

        {view === "summary" ? (
          <DeploymentSummaryPanel
            deployment={deployment}
            pending={pending}
            onRetry={() => void retry(deployment.id)}
            onStop={() => void stop()}
          />
        ) : null}

        {view === "build-logs" ? (
          <DeploymentLogsPanel
            serviceId={service.id}
            deploymentId={deployment.id}
            deploymentStatus={deployment.status}
            kind="build"
            onSettled={() => void refresh()}
          />
        ) : null}

        {view === "runtime-logs" ? (
          <DeploymentLogsPanel
            serviceId={service.id}
            deploymentId={deployment.id}
            deploymentStatus={deployment.status}
            kind="runtime"
            onSettled={() => void refresh()}
          />
        ) : null}

        {view === "events" ? (
          <DeploymentEventsPanel operation={operation} />
        ) : null}
      </div>
    </AppShell>
  )
}
