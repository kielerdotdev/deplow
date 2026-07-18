import { useCallback, useMemo, useState } from "react"
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { BoxIcon, PlusIcon, RocketIcon } from "lucide-react"

import { AddServiceDialog } from "@/components/add-service-dialog"
import { AppShell } from "@/components/app-shell"
import { CommandAction } from "@/components/command-action"
import { ProjectUiContext } from "@/components/project-ui-context"
import { ShellPending } from "@/components/route-pending"
import { SoftHit } from "@/components/soft-hit"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

export const Route = createFileRoute("/projects/$projectId")({
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session)
      throw redirect({ to: "/login", search: { redirect: undefined } })
    const [shell, project, deployments, cluster] = await Promise.all([
      loadShellContext(),
      client.projects.get({ id: params.projectId }),
      client.deployments.list({ projectId: params.projectId }),
      client.cluster.get().catch(() => null),
    ])
    return {
      session,
      shell,
      project,
      deployments,
      cluster,
    }
  },
  pendingComponent: ShellPending,
  component: ProjectLayout,
})

function ProjectLayout() {
  const { session, shell, project, cluster } = Route.useLoaderData()
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openAddService = useCallback(() => setAddOpen(true), [])
  const ui = useMemo(
    () => ({ openAddService, setError }),
    [openAddService],
  )

  async function refresh() {
    await router.invalidate()
  }

  const actions = useMemo(
    () => (
      <>
        <CommandAction
          id={`project.${project.id}.add-service`}
          label="Add service"
          keywords={["add", "service", "create"]}
          icon={PlusIcon}
          onSelect={openAddService}
        />
        <SoftHit as="button" tone="solid" onClick={openAddService}>
          <span className="flex h-8 items-center gap-1.5 px-2 text-[14px] font-medium text-[#a1a1a1]">
            <PlusIcon className="size-3.5" />
            Add service
          </span>
        </SoftHit>
      </>
    ),
    [openAddService, project.id],
  )

  return (
    <ProjectUiContext.Provider value={ui}>
      <AppShell
        user={session.user}
        instanceAdmin={shell.instanceAdmin}
        organizations={shell.organizations}
        activeOrganization={shell.activeOrganization}
        actions={actions}
        observeEnabled={shell.observeEnabled}
      >
        {error ? (
          <div className="shrink-0 border-b border-border px-4 py-3">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        {cluster && cluster.status !== "connected" ? (
          <div className="shrink-0 border-b border-border px-4 py-3">
            <Alert>
              <AlertTitle>No k3s cluster connected</AlertTitle>
              <AlertDescription>
                Deploys require a Kubernetes cluster.{" "}
                {shell.instanceAdmin ? (
                  <>
                    Connect a kubeconfig or create one under{" "}
                    <Link
                      to="/settings/cluster"
                      className="font-medium underline underline-offset-2"
                    >
                      Settings → Cluster
                    </Link>
                    .
                  </>
                ) : (
                  "Ask an admin to connect a cluster."
                )}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {project.services.map((service) => (
          <CommandAction
            key={service.id}
            id={`project.${project.id}.open.${service.id}`}
            label={`Open ${service.name}`}
            keywords={["service", "open", service.name]}
            icon={BoxIcon}
            onSelect={() =>
              void router.navigate({
                to: "/projects/$projectId/services/$serviceId",
                params: { projectId: project.id, serviceId: service.id },
              })
            }
          />
        ))}

        {project.services
          .filter((s) => s.type === "web" || s.type === "worker")
          .map((service) => (
            <CommandAction
              key={`deploy-${service.id}`}
              id={`project.${project.id}.deploy.${service.id}`}
              label={`Deploy ${service.name}`}
              keywords={["deploy", "release", service.name]}
              icon={RocketIcon}
              onSelect={() =>
                void router.navigate({
                  to: "/projects/$projectId/services/$serviceId",
                  params: { projectId: project.id, serviceId: service.id },
                  search: { tab: "deployments" },
                })
              }
            />
          ))}

        <Outlet />

        <AddServiceDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          projectId={project.id}
          onCreated={async (serviceId) => {
            await refresh()
            if (serviceId) {
              void router.navigate({
                to: "/projects/$projectId/services/$serviceId",
                params: { projectId: project.id, serviceId },
              })
            }
          }}
          onError={setError}
        />
      </AppShell>
    </ProjectUiContext.Provider>
  )
}
