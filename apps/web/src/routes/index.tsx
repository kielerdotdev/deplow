import { useState } from "react"
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleIcon,
  EllipsisIcon,
  FolderPlusIcon,
  PlusIcon,
} from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { AppShell } from "@/components/app-shell"
import { CommandAction } from "@/components/command-action"
import {
  DashboardCard,
  DashboardRow,
  StatBlock,
} from "@/components/dashboard-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"
import { formatRelativeTime } from "@/lib/ui-format"

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
  const [createOpen, setCreateOpen] = useState(false)

  const firstName = session.user.name.trim().split(/\s+/)[0] || "Account"
  const readyCount = projects.filter((p) => p.status === "ready").length
  const deployedCount = projects.filter((p) => p.publicUrl).length
  const onlineNodes = nodes.filter((n) => n.status === "online").length
  const githubLinked = git.links.find((l) => l.provider === "github")
  const gitlabLinked = git.links.find((l) => l.provider === "gitlab")

  const nextSteps: {
    label: string
    to: "/integrations" | "/nodes"
    done: boolean
  }[] = shell.instanceAdmin
    ? [
        {
          label: "Connect GitHub or GitLab",
          to: "/integrations",
          done: Boolean(githubLinked || gitlabLinked),
        },
        {
          label: "Register a build node",
          to: "/nodes",
          done: nodes.length > 0,
        },
      ]
    : []
  const openSteps = nextSteps.filter((s) => !s.done)

  return (
    <AppShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      accountHome
      actions={
        <>
          {shell.instanceAdmin ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="More actions"
                  />
                }
              >
                <EllipsisIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem render={<Link to="/integrations" />}>
                  Integrations
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link to="/nodes" />}>
                  Nodes
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <CommandAction
            id="project.new"
            label="New project"
            keywords={["create", "add", "project"]}
            icon={FolderPlusIcon}
            onSelect={() => setCreateOpen(true)}
          />
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {firstName}
        </h1>
      </div>

      <section
        className={
          shell.instanceAdmin
            ? "surface-panel grid sm:grid-cols-3"
            : "surface-panel grid sm:grid-cols-2"
        }
      >
        <StatBlock
          label="Projects"
          value={projects.length}
          hint={`${readyCount} ready`}
        />
        <StatBlock
          label="Public URLs"
          value={deployedCount}
          hint={deployedCount ? "Reachable" : "Deploy to publish"}
        />
        {shell.instanceAdmin ? (
          <StatBlock
            label="Nodes"
            value={nodes.length}
            hint={nodes.length ? `${onlineNodes} online` : "None registered"}
          />
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardCard
          title="Projects"
          count={projects.length}
          onAdd={() => setCreateOpen(true)}
        >
          {projects.length === 0 ? (
            <div className="flex flex-col items-start gap-3 px-4 py-8">
              <p className="text-sm text-muted-foreground">
                No projects yet. Create one to provision Postgres, Redis, and
                storage.
              </p>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <FolderPlusIcon data-icon="inline-start" />
                New project
              </Button>
            </div>
          ) : (
            projects.map((project) => {
              const host = project.publicUrl?.replace(/^https?:\/\//, "")
              return (
                <DashboardRow
                  key={project.id}
                  to="/projects/$projectId"
                  params={{ projectId: project.id }}
                  leading={
                    project.status === "ready" ? (
                      <CheckCircle2Icon className="size-4 shrink-0 text-success" />
                    ) : (
                      <CircleIcon className="size-4 shrink-0 text-muted-foreground" />
                    )
                  }
                  title={project.name}
                  subtitle={
                    host ? (
                      <span className="font-mono text-[11px]">{host}</span>
                    ) : (
                      "No public URL"
                    )
                  }
                  trailing={formatRelativeTime(project.updatedAt)}
                />
              )
            })
          )}
        </DashboardCard>

        {shell.instanceAdmin ? (
          <DashboardCard title="Nodes" count={nodes.length} href="/nodes">
            {nodes.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">
                Register this machine so projects can build and run.
              </div>
            ) : (
              nodes.map((node) => (
                <DashboardRow
                  key={node.id}
                  to="/nodes"
                  leading={
                    node.status === "online" ? (
                      <CheckCircle2Icon className="size-4 shrink-0 text-success" />
                    ) : (
                      <CircleIcon className="size-4 shrink-0 text-muted-foreground" />
                    )
                  }
                  title={node.name}
                  subtitle={`${node.provider} · ${node.host}`}
                  trailing={node.status}
                />
              ))
            )}
          </DashboardCard>
        ) : null}

        {shell.instanceAdmin ? (
          <DashboardCard title="Integrations" href="/integrations">
            <DashboardRow
              to="/integrations"
              title="GitHub"
              subtitle={
                githubLinked
                  ? `Connected as @${githubLinked.login}`
                  : git.githubAppConfigured
                    ? "App ready — connect account"
                    : "Not connected"
              }
              trailing={githubLinked ? "Connected" : "Set up"}
            />
            <DashboardRow
              to="/integrations"
              title="GitLab"
              subtitle={
                gitlabLinked
                  ? `Connected as @${gitlabLinked.login}`
                  : git.gitlabOAuthConfigured
                    ? "OAuth ready — connect account"
                    : "Not connected"
              }
              trailing={gitlabLinked ? "Connected" : "Set up"}
            />
          </DashboardCard>
        ) : null}

        {openSteps.length > 0 ? (
          <DashboardCard title="Next steps">
            {openSteps.map((step) => (
              <Link
                key={step.label}
                to={step.to}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 text-sm font-medium last:border-b-0 hover:bg-muted/50"
              >
                {step.label}
                <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </DashboardCard>
        ) : null}
      </div>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </AppShell>
  )
}
