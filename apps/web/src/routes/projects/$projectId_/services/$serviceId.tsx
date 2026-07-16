import { useState } from "react"
import {
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { z } from "zod"

import { AppShell } from "@/components/app-shell"
import { BackupsPanel } from "@/components/backups-panel"
import { DatabasePanel } from "@/components/database-panel"
import { DeploymentRow } from "@/components/service/deployment-row"
import { ServiceHeader } from "@/components/service/service-header"
import { ServiceNav, type ServiceTab } from "@/components/service/service-nav"
import { ServiceOverview } from "@/components/service/service-overview"
import {
  ServiceSettings,
  type SettingsSection,
} from "@/components/service/service-settings"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

const serviceSearchSchema = z.object({
  tab: z
    .enum([
      "overview",
      "deployments",
      "logs",
      "connections",
      "database",
      "backups",
      "settings",
    ])
    .optional()
    .catch("overview"),
  section: z
    .enum([
      "general",
      "source",
      "domains",
      "environment",
      "resources",
      "danger",
    ])
    .optional()
    .catch(undefined),
})

export const Route = createFileRoute(
  "/projects/$projectId_/services/$serviceId",
)({
  validateSearch: (search) => serviceSearchSchema.parse(search),
  loader: async ({ params, location }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    const search = serviceSearchSchema.parse(location.search)
    if (search.tab === "connections") {
      throw redirect({
        to: "/projects/$projectId/services/$serviceId",
        params: {
          projectId: params.projectId,
          serviceId: params.serviceId,
        },
        search: { tab: "settings", section: "resources" },
      })
    }
    const [shell, project, service, deployments] = await Promise.all([
      loadShellContext(),
      client.projects.get({ id: params.projectId }),
      client.services.get({ id: params.serviceId }),
      client.deployments.list({ serviceId: params.serviceId }),
    ])
    if (search.tab === "logs") {
      const target = deployments[0]
      if (target) {
        throw redirect({
          to: "/projects/$projectId/services/$serviceId/deployments/$deploymentId",
          params: {
            projectId: params.projectId,
            serviceId: params.serviceId,
            deploymentId: target.id,
          },
          search: { view: "build-logs" },
        })
      }
      throw redirect({
        to: "/projects/$projectId/services/$serviceId",
        params: {
          projectId: params.projectId,
          serviceId: params.serviceId,
        },
        search: { tab: "deployments" },
      })
    }
    if (service.projectId !== project.id) {
      throw redirect({
        to: "/projects/$projectId",
        params: { projectId: params.projectId },
      })
    }
    const isData = service.type === "postgres" || service.type === "redis"
    const [dbOverview, backups, pitr] = isData
      ? await Promise.all([
          client.projects.databaseOverview({ id: params.projectId }),
          client.projects.listBackups({ id: params.projectId }),
          client.projects.pitrStatus({ id: params.projectId }),
        ])
      : [null, [], null]
    return {
      session,
      shell,
      project,
      service,
      deployments,
      dbOverview,
      backups,
      pitr,
    }
  },
  component: ServicePage,
})

function ServicePage() {
  const {
    session,
    shell,
    project,
    service,
    deployments,
    dbOverview,
    backups,
    pitr,
  } = Route.useLoaderData()
  const search = Route.useSearch()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isData = service.type === "postgres" || service.type === "redis"
  const isApp = service.type === "web" || service.type === "worker"
  const providers = project.services.filter(
    (s) => s.type === "postgres" || s.type === "redis",
  )

  const tabParam = search.tab
  const tab: ServiceTab =
    tabParam === "database" ||
    tabParam === "backups" ||
    tabParam === "deployments" ||
    tabParam === "settings" ||
    tabParam === "overview"
      ? tabParam
      : "overview"

  const section: SettingsSection = search.section ?? "general"

  function setTab(next: ServiceTab, sectionNext?: SettingsSection) {
    void router.navigate({
      to: "/projects/$projectId/services/$serviceId",
      params: { projectId: project.id, serviceId: service.id },
      search: {
        tab: next,
        section: next === "settings" ? (sectionNext ?? section) : undefined,
      },
      replace: true,
    })
  }

  async function refresh() {
    await router.invalidate()
  }

  function goToDeployment(
    deploymentId: string,
    view: "summary" | "build-logs" = "summary",
  ) {
    void router.navigate({
      to: "/projects/$projectId/services/$serviceId/deployments/$deploymentId",
      params: {
        projectId: project.id,
        serviceId: service.id,
        deploymentId,
      },
      search: { view },
    })
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
      goToDeployment(created.id, "build-logs")
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
      goToDeployment(created.id, "build-logs")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  async function createBinding(providerId: string, envKey: string) {
    if (!providerId || !envKey) return
    setPending(true)
    setError(null)
    try {
      await client.bindings.create({
        consumerServiceId: service.id,
        providerServiceId: providerId,
        envKey,
      })
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  async function removeBinding(id: string) {
    setPending(true)
    try {
      await client.bindings.destroy({ id })
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  async function destroyService() {
    setPending(true)
    try {
      await client.services.destroy({ id: service.id })
      void router.navigate({
        to: "/projects/$projectId",
        params: { projectId: project.id },
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setPending(false)
    }
  }

  async function cancelDeployment(deploymentId: string) {
    setPending(true)
    setError(null)
    try {
      await client.deployments.stop({ id: deploymentId })
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  const tabs: Array<{ id: ServiceTab; label: string }> = [
    { id: "overview", label: "Overview" },
    ...(isApp
      ? [{ id: "deployments" as const, label: "Deployments" }]
      : []),
    ...(isData
      ? [
          { id: "database" as const, label: "Database" },
          { id: "backups" as const, label: "Backups" },
        ]
      : []),
    { id: "settings", label: "Settings" },
  ]

  const serviceWithBindings = service as typeof service & {
    bindings?: Array<{
      id: string
      envKey: string
      providerName: string | null
      providerType: string | null
    }>
  }

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
          pending={pending}
          onDeploy={() => void deploy()}
          onRetry={(id) => void retry(id)}
          onRetryProvision={
            isData
              ? () =>
                  void client.services
                    .retryProvision({ id: service.id })
                    .then(refresh)
                    .catch((cause) =>
                      setError(
                        cause instanceof Error ? cause.message : String(cause),
                      ),
                    )
              : undefined
          }
          onViewDeployment={(id) => goToDeployment(id, "summary")}
        />

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <ServiceNav tabs={tabs} active={tab} onChange={(t) => setTab(t)} />

        {tab === "overview" ? (
          <ServiceOverview
            projectId={project.id}
            serviceId={service.id}
            serviceStatus={service.status}
            publicUrl={service.publicUrl}
            isApp={isApp}
            git={service.git}
            deployments={deployments}
            pending={pending}
            onCancel={(id) => void cancelDeployment(id)}
          />
        ) : null}

        {tab === "deployments" ? (
          <div className="surface-panel divide-y divide-border">
            {deployments.length === 0 ? (
              <p className="px-4 py-8 text-sm text-muted-foreground">
                No deployments yet
              </p>
            ) : (
              deployments.map((d) => (
                <DeploymentRow
                  key={d.id}
                  projectId={project.id}
                  serviceId={service.id}
                  deployment={d}
                  actions={
                    <>
                      {d.status === "failed" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            void retry(d.id)
                          }}
                        >
                          Retry
                        </Button>
                      ) : null}
                      {d.image &&
                      (d.status === "stopped" ||
                        (d.status === "running" &&
                          d.image !== service.image)) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            void client.deployments
                              .rollback({
                                serviceId: service.id,
                                deploymentId: d.id,
                              })
                              .then(refresh)
                          }}
                        >
                          Rollback
                        </Button>
                      ) : null}
                    </>
                  }
                />
              ))
            )}
          </div>
        ) : null}

        {tab === "database" && dbOverview ? (
          <DatabasePanel
            projectId={project.id}
            overview={dbOverview}
            onRefresh={refresh}
          />
        ) : null}

        {tab === "backups" && pitr ? (
          <BackupsPanel
            projectId={project.id}
            projectName={project.name}
            backups={backups}
            pitr={pitr}
            onRefresh={refresh}
          />
        ) : null}

        {tab === "settings" ? (
          <ServiceSettings
            projectId={project.id}
            service={serviceWithBindings}
            section={section}
            onSectionChange={(s) => setTab("settings", s)}
            providers={providers}
            pending={pending}
            onChanged={refresh}
            onBind={createBinding}
            onRemoveBinding={removeBinding}
            onDestroy={destroyService}
          />
        ) : null}
      </div>
    </AppShell>
  )
}
