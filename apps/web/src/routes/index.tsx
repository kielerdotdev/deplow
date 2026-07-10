import { useState } from "react"
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { FolderPlusIcon, PlusIcon } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
    const [projectList, nodeList] = await Promise.all([
      client.projects.list(),
      client.nodes.list(),
    ])
    return { session, projects: projectList, nodes: nodeList }
  },
  component: DashboardPage,
})

function DashboardPage() {
  const { session, projects, nodes } = Route.useLoaderData()
  const router = useRouter()
  const [name, setName] = useState("")
  const [spawnBuildServer, setSpawnBuildServer] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const project = await client.projects.create({ name, spawnBuildServer })
      setName("")
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
      description="Each project ships with Postgres, Redis, S3, and secrets"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
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
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
                  <FolderPlusIcon className="size-8 text-muted-foreground" />
                  <p className="text-sm font-medium">No projects yet</p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Use the form to create one. We&apos;ll provision Postgres,
                    Redis, and object storage automatically.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">ID</TableHead>
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
                        <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                          {project.id.slice(0, 8)}
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

          <Card size="sm">
            <CardHeader>
              <CardTitle>Nodes</CardTitle>
              <CardDescription>
                {nodes.length === 0
                  ? "No Docker nodes registered."
                  : `${nodes.length} node${nodes.length === 1 ? "" : "s"} available`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {nodes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Open{" "}
                  <Link to="/nodes" className="underline underline-offset-2">
                    Nodes
                  </Link>{" "}
                  to register the local Docker socket.
                </p>
              ) : (
                nodes.map((node) => (
                  <div
                    key={node.id}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
                  >
                    <span className="font-medium">{node.name}</span>
                    <StatusBadge status={node.status} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>New project</CardTitle>
            <CardDescription>
              Slug becomes the resource namespace for DB, Redis, and S3.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleCreate}>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="project-name">Name (slug)</Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-app"
                  pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
                  required
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers, and hyphens.
                </p>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={spawnBuildServer}
                  onCheckedChange={(checked) =>
                    setSpawnBuildServer(checked === true)
                  }
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Ephemeral build container</span>
                  <span className="block text-xs text-muted-foreground">
                    Optional local Docker stand-in for a build VM.
                  </span>
                </span>
              </label>

              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>Could not create project</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                disabled={pending || !name}
                className="w-full"
              >
                <PlusIcon data-icon="inline-start" />
                {pending ? "Provisioning…" : "Create project"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </AppShell>
  )
}
