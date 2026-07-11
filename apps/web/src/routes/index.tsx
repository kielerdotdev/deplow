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
import { formatDateTime, summarizeDeployError } from "@/lib/ui-format"

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
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openCreate() {
    setError(null)
    setCreateOpen(true)
  }

  function handleCreateOpenChange(open: boolean) {
    setCreateOpen(open)
    if (!open) {
      setName("")
      setError(null)
      setPending(false)
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const project = await client.projects.create({
        name,
      })
      handleCreateOpenChange(false)
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

  const createButton = (
    <Button size="sm" onClick={openCreate}>
      <PlusIcon data-icon="inline-start" />
      New project
    </Button>
  )

  return (
    <AppShell
      user={session.user}
      title="Projects"
      description="Your apps with Postgres, Redis, and S3 — deploy and we inject credentials."
      actions={projects.length > 0 ? createButton : undefined}
    >
      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderPlusIcon}
            title="Create your first project"
            description="One name is enough. We provision Postgres, Redis, and object storage together, then give you a URL on deploy."
            action={
              <Button onClick={openCreate}>
                <PlusIcon data-icon="inline-start" />
                Create project
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Your projects</CardTitle>
            <CardDescription>
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
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
                    <TableCell className="max-w-[min(28rem,50vw)] min-w-0">
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: project.id }}
                        className="font-medium hover:underline"
                      >
                        {project.name}
                      </Link>
                      {project.errorMessage ? (
                        <p
                          className="mt-0.5 truncate text-xs text-destructive"
                          title={project.errorMessage}
                        >
                          {summarizeDeployError(project.errorMessage)}
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
                          <ExternalLinkIcon className="size-3 shrink-0" />
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(project.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ActionDialog
        open={createOpen}
        onOpenChange={handleCreateOpenChange}
        title="Create project"
        description="One name is enough. We always provision Postgres, Redis, and S3 together."
        icon={FolderPlusIcon}
        footer={
          <>
            <Button
              type="submit"
              form="create-project-form"
              disabled={pending || !name.trim()}
            >
              <PlusIcon data-icon="inline-start" />
              {pending ? "Creating…" : "Create project"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => handleCreateOpenChange(false)}
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
    </AppShell>
  )
}
