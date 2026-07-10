import { useState } from "react"
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { ExternalLinkIcon, FolderPlusIcon, PlusIcon } from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { AppShell } from "@/components/app-shell"
import { EmptyState } from "@/components/empty-state"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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

export const Route = createFileRoute("/")({
  loader: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login" })
    }
    const projectList = await client.projects.list()
    return { session, projects: projectList }
  },
  component: DashboardPage,
})

function DashboardPage() {
  const { session, projects } = Route.useLoaderData()
  const router = useRouter()
  const [name, setName] = useState("")
  const [gitRepoUrl, setGitRepoUrl] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const project = await client.projects.create({
        name,
        gitRepoUrl: gitRepoUrl.trim() || undefined,
      })
      setName("")
      setGitRepoUrl("")
      setCreateOpen(false)
      await router.invalidate()
      await router.navigate({
        to: "/projects/$projectId",
        params: { projectId: project.id },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <AppShell
      user={session.user}
      title="Projects"
      description="Each project is your app plus Postgres, Redis, and S3. Deploy source; we inject credentials, give you a URL, and back up Postgres."
      actions={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          Create project
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Your projects</CardTitle>
          <CardDescription>
            {projects.length === 0
              ? "Create a project to provision isolated platform resources."
              : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <EmptyState
              icon={FolderPlusIcon}
              title="No projects yet"
              description="Name your project and we'll provision Postgres, Redis, and object storage automatically."
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <PlusIcon data-icon="inline-start" />
                  Create project
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">URL</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell>
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: project.id }}
                        className="font-medium hover:underline"
                      >
                        {project.name}
                      </Link>
                      {project.errorMessage ? (
                        <p className="mt-0.5 text-xs text-destructive">
                          {project.errorMessage}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={project.status} />
                    </TableCell>
                    <TableCell className="hidden max-w-[220px] truncate font-mono text-xs text-muted-foreground sm:table-cell">
                      {project.publicUrl ? (
                        <a
                          href={project.publicUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                        >
                          {project.publicUrl.replace(/^https?:\/\//, "")}
                          <ExternalLinkIcon className="size-3" />
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {new Date(project.updatedAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ActionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create project"
        description="One name is enough. We always provision Postgres, Redis, and S3 together."
        footer={
          <Button
            type="submit"
            form="create-project-form"
            disabled={pending || !name}
          >
            <PlusIcon data-icon="inline-start" />
            {pending ? "Creating…" : "Create project"}
          </Button>
        }
      >
        <form
          id="create-project-form"
          onSubmit={handleCreate}
          className="flex flex-col gap-4"
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="git-url">
              Git repository{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="git-url"
              type="url"
              value={gitRepoUrl}
              onChange={(e) => setGitRepoUrl(e.target.value)}
              placeholder="https://github.com/you/app.git"
            />
            <p className="text-xs text-muted-foreground">
              Connect now or later. Push to main deploys production.
            </p>
          </div>
        </form>
      </ActionDialog>
    </AppShell>
  )
}
