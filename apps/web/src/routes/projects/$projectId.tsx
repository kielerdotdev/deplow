import { useCallback, useMemo, useState } from "react"
import {
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { BoxIcon, PlusIcon, RocketIcon, Trash2Icon } from "lucide-react"

import { AddServiceDialog } from "@/components/add-service-dialog"
import { AppShell } from "@/components/app-shell"
import { CommandAction } from "@/components/command-action"
import { ProjectUiContext } from "@/components/project-ui-context"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

export const Route = createFileRoute("/projects/$projectId")({
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session)
      throw redirect({ to: "/login", search: { redirect: undefined } })
    const [shell, project, deployments, projects] = await Promise.all([
      loadShellContext(),
      client.projects.get({ id: params.projectId }),
      client.deployments.list({ projectId: params.projectId }),
      client.projects.list(),
    ])
    return {
      session,
      shell,
      project,
      deployments,
      deployProjects: projects.map((p) => ({ id: p.id, name: p.name })),
    }
  },
  component: ProjectLayout,
})

function ProjectLayout() {
  const { session, shell, project, deployProjects } = Route.useLoaderData()
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [pending, setPending] = useState(false)
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
        <Button onClick={openAddService}>
          <PlusIcon data-icon="inline-start" />
          Add service
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            void (async () => {
              if (
                !window.confirm(
                  `Destroy ${project.name}? Type confirmation is also available in Settings.`,
                )
              )
                return
              setPending(true)
              try {
                await client.projects.destroy({ id: project.id })
                void router.navigate({ to: "/" })
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause))
                setPending(false)
              }
            })()
          }
        >
          <Trash2Icon data-icon="inline-start" />
          Destroy
        </Button>
      </>
    ),
    [openAddService, pending, project.id, project.name, router],
  )

  return (
    <ProjectUiContext.Provider value={ui}>
      <AppShell
        user={session.user}
        instanceAdmin={shell.instanceAdmin}
        organizations={shell.organizations}
        activeOrganization={shell.activeOrganization}
        deployProjectId={project.id}
        deployProjects={deployProjects}
        actions={actions}
      >
        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
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
