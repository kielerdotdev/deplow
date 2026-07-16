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
import { DashboardCard, DashboardRow } from "@/components/dashboard-card"
import { ProjectContextMenu } from "@/components/project-context-menu"
import { ProjectDeleteDialog } from "@/components/project-delete-dialog"
import { PageContent, PageHeader } from "@/components/page-layout"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
    const [projects, nodes, git] = await Promise.all([
      client.projects.list(),
      shell.instanceAdmin ? client.nodes.list() : Promise.resolve([]),
      client.git.connectionStatus(),
    ])
    return { session, shell, projects, nodes, git }
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
  const { session, shell, projects, nodes, git } = Route.useLoaderData()
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const projectToDelete = projects.find((project) => project.id === deleteProjectId)

  const firstName = session.user.name.trim().split(/\s+/)[0] || "there"
  const serviceCount = projects.reduce(
    (sum, p) => sum + (p.services?.length ?? 0),
    0,
  )
  const githubLinked = git.links.find((l) => l.provider === "github")
  const gitlabLinked = git.links.find((l) => l.provider === "gitlab")

  const nextSteps: {
    label: string
    to: "/settings/integrations" | "/settings/nodes"
    done: boolean
  }[] = shell.instanceAdmin
    ? [
        {
          label: "Connect GitHub or GitLab",
          to: "/settings/integrations",
          done: Boolean(githubLinked || gitlabLinked),
        },
        {
          label: "Register a build node",
          to: "/settings/nodes",
          done: nodes.length > 0,
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
    <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
      <PlusIcon data-icon="inline-start" />
      New project
    </Button>
  )

  return (
    <AppShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      accountHome
      deployProjects={projects.map((p) => ({ id: p.id, name: p.name }))}
    >
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Deploy and manage services on your Docker host. Sandboxed by default."
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
      <PageContent width="wide">

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Could not destroy project</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {shell.instanceAdmin && openSteps.length > 0 ? (
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
      ) : null}

      <div
        className={cn(
          "grid min-w-0 gap-6",
          showSidebar && "xl:grid-cols-[minmax(0,1fr)_17.5rem] xl:gap-8",
        )}
      >
        <section className="surface-panel min-w-0 overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                Projects
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {serviceCount} services across {projects.length} project
                {projects.length === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(true)}
            >
              <PlusIcon data-icon="inline-start" />
              Add
            </Button>
          </header>

          {projects.length === 0 ? (
            <EmptyState
              variant="compact"
              icon={FolderPlusIcon}
              title="No projects yet"
              description="Add Postgres, Redis, and deploy from git in one workspace."
              action={
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <FolderPlusIcon data-icon="inline-start" />
                  New project
                </Button>
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
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="data-table-head data-table-cell pl-5">
                    Project
                  </TableHead>
                  <TableHead className="data-table-head data-table-cell">
                    URL
                  </TableHead>
                  <TableHead className="data-table-head data-table-cell">
                    Services
                  </TableHead>
                  <TableHead className="data-table-head data-table-cell">
                    Status
                  </TableHead>
                  <TableHead className="data-table-head data-table-cell pr-5 text-right">
                    Updated
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
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
                        <TableRow className="data-table-row group" />
                      }
                    >
                      <TableCell className="data-table-cell pl-5 font-medium">
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: project.id }}
                          className="hover:text-primary hover:underline"
                        >
                          {project.name}
                        </Link>
                      </TableCell>
                      <TableCell className="data-table-cell font-mono text-xs text-muted-foreground">
                        {host ?? "—"}
                      </TableCell>
                      <TableCell className="data-table-cell text-muted-foreground">
                        {project.services?.length ?? 0}
                      </TableCell>
                      <TableCell className="data-table-cell">
                        <StatusBadge status={project.status} />
                      </TableCell>
                      <TableCell className="data-table-cell pr-5 text-right text-xs text-muted-foreground">
                        {formatRelativeTime(project.updatedAt)}
                      </TableCell>
                    </ProjectContextMenu>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </section>

        {showSidebar ? (
          <aside className="flex min-w-0 flex-col gap-4">
            {recentProjects.length > 0 ? (
              <DashboardCard title="Recent" count={recentProjects.length}>
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
              </DashboardCard>
            ) : null}

            {shell.instanceAdmin ? (
              <DashboardCard title="Quick links">
                <DashboardRow
                  to="/settings/integrations"
                  leading={
                    <div className="icon-well size-7 shrink-0">
                      <PlugIcon className="size-3.5" />
                    </div>
                  }
                  title="Integrations"
                  subtitle={integrationStatus}
                />
                <DashboardRow
                  to="/settings/nodes"
                  leading={
                    <div className="icon-well size-7 shrink-0">
                      <ServerIcon className="size-3.5" />
                    </div>
                  }
                  title="Nodes"
                  subtitle={
                    nodes.length === 0
                      ? "Register a build host"
                      : `${nodes.length} node${nodes.length === 1 ? "" : "s"} registered`
                  }
                />
                <DashboardRow
                  to="/settings/domains"
                  leading={
                    <div className="icon-well size-7 shrink-0">
                      <GlobeIcon className="size-3.5" />
                    </div>
                  }
                  title="Domains"
                  subtitle="Public URLs and subdomains"
                />
              </DashboardCard>
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
