import { useState } from "react"
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import {
  ArrowRightIcon,
  FolderPlusIcon,
  GitBranchIcon,
  GlobeIcon,
  PlugIcon,
  PlusIcon,
  ServerIcon,
} from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { EmptyState } from "@/components/empty-state"
import { AppShell } from "@/components/app-shell"
import { CommandAction } from "@/components/command-action"
import { DashboardRow } from "@/components/dashboard-card"
import { ProjectContextMenu } from "@/components/project-context-menu"
import { ProjectDeleteDialog } from "@/components/project-delete-dialog"
import {
  PageContent,
  PageHeader,
  PanelActionButton,
} from "@/components/page-layout"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"
import { formatRelativeTime } from "@/lib/ui-format"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/")({
  loader: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    const shell = await loadShellContext()
    const [projects, cluster, git] = await Promise.all([
      client.projects.list(),
      shell.instanceAdmin
        ? client.cluster.get()
        : Promise.resolve(null),
      client.git.connectionStatus(),
    ])
    return { session, shell, projects, cluster, git }
  },
  component: DashboardPage,
})

function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!open) return null
  return <CreateProjectDialogBody onOpenChange={onOpenChange} />
}

function CreateProjectDialogBody({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    onOpenChange(false)
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const project = await client.projects.create({ name })
      close()
      const { useProjectStore } = await import("@/lib/project-store")
      useProjectStore.getState().setActiveProjectId(project.id)
      await useProjectStore.getState().refresh()
      await router.invalidate()
      await router.navigate({
        to: "/projects/$projectId",
        params: { projectId: project.id },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPending(false)
    }
  }

  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      title="New project"
      description="Lowercase letters, numbers, and hyphens."
      footer={
        <>
          <Button
            type="submit"
            form="create-project-form"
            disabled={pending || !name.trim()}
          >
            {pending ? "Creating…" : "Create"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={close}
          >
            Cancel
          </Button>
        </>
      }
    >
      <form
        id="create-project-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => void handleCreate(e)}
      >
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not create project</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-app"
            pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
            required
            autoFocus
          />
        </div>
      </form>
    </ActionDialog>
  )
}

function DashboardPage() {
  const { session, shell, projects, cluster, git } = Route.useLoaderData()
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const projectToDelete = projects.find((project) => project.id === deleteProjectId)

  const serviceCount = projects.reduce(
    (sum, p) => sum + (p.services?.length ?? 0),
    0,
  )
  const githubLinked = git.links.find((l) => l.provider === "github")
  const gitlabLinked = git.links.find((l) => l.provider === "gitlab")
  const clusterReady = cluster?.status === "connected"

  const nextSteps: {
    label: string
    to: "/settings/integrations" | "/settings/cluster"
    done: boolean
  }[] = shell.instanceAdmin
    ? [
        {
          label: "Connect GitHub or GitLab",
          to: "/settings/integrations",
          done: Boolean(githubLinked || gitlabLinked),
        },
        {
          label:
            cluster?.status === "error"
              ? "Fix cluster connection"
              : "Connect a k3s cluster",
          to: "/settings/cluster",
          done: clusterReady,
        },
      ]
    : []
  const openSteps = nextSteps.filter((s) => !s.done)

  const integrationStatus = githubLinked || gitlabLinked
    ? `${[githubLinked && "GitHub", gitlabLinked && "GitLab"].filter(Boolean).join(", ")} connected`
    : "Not connected"

  const recentProjects = [...projects]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, 5)

  const showSidebar =
    recentProjects.length > 0 || shell.instanceAdmin

  async function handleDestroyProject() {
    if (!projectToDelete) return
    setPending(true)
    setError(null)
    try {
      await client.projects.destroy({ id: projectToDelete.id })
      setDeleteProjectId(null)
      await router.invalidate()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  const projectMenuProps = (project: (typeof projects)[number]) => ({
    projectName: project.name,
    serviceCount: project.services?.length ?? 0,
    onDelete: () => setDeleteProjectId(project.id),
    pending,
  })

  const newProjectButton = (
    <PanelActionButton onClick={() => setCreateOpen(true)}>
      New project
    </PanelActionButton>
  )

  return (
    <AppShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      accountHome
      observeEnabled={shell.observeEnabled}
    >
      <PageHeader
        title="Projects"
        description={`${serviceCount} services across ${projects.length} project${projects.length === 1 ? "" : "s"}`}
        actions={
          <>
            <CommandAction
              id="project.new"
              label="New project"
              keywords={["create", "add", "project"]}
              icon={FolderPlusIcon}
              onSelect={() => setCreateOpen(true)}
            />
            {newProjectButton}
          </>
        }
      />
      <PageContent width="flush">
        {error ? (
          <div className="border-b border-border px-4 py-3">
            <Alert variant="destructive">
              <AlertTitle>Could not destroy project</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        {shell.instanceAdmin && openSteps.length > 0 ? (
          <div className="border-b border-border px-4 py-3">
            <Alert>
              <AlertTitle>Setup</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {openSteps.map((step) => (
                  <Link
                    key={step.label}
                    to={step.to}
                    className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                  >
                    {step.label}
                    <ArrowRightIcon className="size-3.5" />
                  </Link>
                ))}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        <div
          className={cn(
            "grid min-h-0 min-w-0 flex-1",
            showSidebar && "xl:grid-cols-[minmax(0,1fr)_15rem]",
          )}
        >
          <section className="min-w-0 overflow-hidden">
            {projects.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  variant="compact"
                  icon={FolderPlusIcon}
                  title="No projects yet"
                  description="Add Postgres, Redis, and deploy from git in one workspace."
                  action={
                    <PanelActionButton onClick={() => setCreateOpen(true)}>
                      New project
                    </PanelActionButton>
                  }
                  steps={[
                    {
                      icon: FolderPlusIcon,
                      label: "Create project",
                      hint: "One workspace per app",
                    },
                    {
                      icon: PlusIcon,
                      label: "Add services",
                      hint: "Postgres, Redis, web apps",
                    },
                    {
                      icon: GitBranchIcon,
                      label: "Deploy",
                      hint: "Connect git and push",
                    },
                  ]}
                />
              </div>
            ) : (
              <div className="overflow-auto">
                {projects.map((project) => {
                  const host = project.publicUrl?.replace(/^https?:\/\//, "")
                  return (
                    <ProjectContextMenu
                      key={project.id}
                      project={{
                        id: project.id,
                        name: project.name,
                        serviceCount: project.services?.length ?? 0,
                      }}
                      pending={pending}
                      onDelete={() => setDeleteProjectId(project.id)}
                      render={
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: project.id }}
                          className="app-row grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_100px_112px]"
                        />
                      }
                    >
                      <div className="flex min-w-0 items-center gap-2 px-2">
                        <StatusBadge status={project.status} />
                        <span className="truncate text-foreground">
                          {project.name}
                        </span>
                      </div>
                      <div className="min-w-0 truncate px-2 font-mono text-[12px] text-muted-foreground">
                        {host ?? "—"}
                      </div>
                      <div className="px-2 text-muted-foreground">
                        {(project.services?.length ?? 0) === 1
                          ? "1 service"
                          : `${project.services?.length ?? 0} services`}
                      </div>
                      <div className="px-2 text-right tabular-nums text-muted-foreground">
                        {formatRelativeTime(project.updatedAt)}
                      </div>
                    </ProjectContextMenu>
                  )
                })}
              </div>
            )}
          </section>

          {showSidebar ? (
            <aside className="hidden min-w-0 flex-col border-l border-border xl:flex">
              {recentProjects.length > 0 ? (
                <div className="border-b border-border">
                  <div className="flex h-12 items-center px-4 text-[14px] font-medium text-foreground">
                    Recent
                  </div>
                  {recentProjects.map((project) => {
                    const host = project.publicUrl?.replace(/^https?:\/\//, "")
                    return (
                      <DashboardRow
                        key={project.id}
                        to="/projects/$projectId"
                        params={{ projectId: project.id }}
                        projectMenu={projectMenuProps(project)}
                        title={project.name}
                        subtitle={
                          host ??
                          `${project.services?.length ?? 0} service${(project.services?.length ?? 0) === 1 ? "" : "s"}`
                        }
                        trailing={formatRelativeTime(project.updatedAt)}
                      />
                    )
                  })}
                </div>
              ) : null}

              {shell.instanceAdmin ? (
                <div>
                  <div className="flex h-12 items-center px-4 text-[14px] font-medium text-foreground">
                    Quick links
                  </div>
                  <DashboardRow
                    to="/settings/integrations"
                    leading={
                      <PlugIcon className="size-4 text-muted-foreground" />
                    }
                    title="Integrations"
                    subtitle={integrationStatus}
                  />
                  <DashboardRow
                    to="/settings/cluster"
                    leading={
                      <ServerIcon className="size-4 text-muted-foreground" />
                    }
                    title="Cluster"
                    subtitle={
                      clusterReady
                        ? "k3s connected"
                        : "Connect or create k3s"
                    }
                  />
                  <DashboardRow
                    to="/settings/networking"
                    leading={
                      <GlobeIcon className="size-4 text-muted-foreground" />
                    }
                    title="Networking"
                    subtitle="Public URLs and subdomains"
                  />
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>
      </PageContent>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ProjectDeleteDialog
        project={
          projectToDelete
            ? {
                id: projectToDelete.id,
                name: projectToDelete.name,
                serviceCount: projectToDelete.services?.length ?? 0,
              }
            : null
        }
        open={deleteProjectId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteProjectId(null)
        }}
        pending={pending}
        onConfirm={handleDestroyProject}
      />
    </AppShell>
  )
}
