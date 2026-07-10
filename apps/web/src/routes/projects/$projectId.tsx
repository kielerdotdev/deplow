import { useState } from "react"
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import {
  CopyIcon,
  DatabaseBackupIcon,
  RocketIcon,
  Trash2Icon,
} from "lucide-react"

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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"

export const Route = createFileRoute("/projects/$projectId")({
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) throw redirect({ to: "/login" })

    const [project, deployments, backups, nodes, schedule] = await Promise.all([
      client.projects.get({ id: params.projectId }),
      client.deployments.list({ projectId: params.projectId }),
      client.projects.listBackups({ id: params.projectId }),
      client.nodes.list(),
      client.projects.backupSchedule({ id: params.projectId }),
    ])
    return { session, project, deployments, backups, nodes, schedule }
  },
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { session, project, deployments, backups, nodes, schedule } =
    Route.useLoaderData()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string | null>(null)
  const [mode, setMode] = useState<"image" | "source">("image")
  const [image, setImage] = useState("hashicorp/http-echo:1.0")
  const [sourcePath, setSourcePath] = useState("")
  const [serviceName, setServiceName] = useState("web")
  const [publishPort, setPublishPort] = useState(18080)
  const [containerPort, setContainerPort] = useState(5678)
  const [copied, setCopied] = useState(false)
  const localNode = nodes.find((n) => n.provider === "docker")

  async function refresh() {
    await router.invalidate()
  }

  async function runBackup() {
    setPending(true)
    setError(null)
    try {
      await client.projects.backup({ id: project.id })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function destroyProject() {
    setPending(true)
    setError(null)
    try {
      await client.projects.destroy({ id: project.id })
      await router.navigate({ to: "/" })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function deploy() {
    setPending(true)
    setError(null)
    try {
      let nodeId = localNode?.id
      if (!nodeId) {
        const node = await client.nodes.ensureLocal()
        nodeId = node.id
      }
      if (mode === "image") {
        await client.deployments.create({
          projectId: project.id,
          nodeId,
          serviceName,
          image,
          options: {
            image,
            publishPort,
            containerPort,
            env: {
              ECHO_TEXT: `hello-from-${project.name}`,
            },
          },
        })
      } else {
        await client.deployments.create({
          projectId: project.id,
          nodeId,
          serviceName,
          sourcePath,
          options: {
            publishPort,
            containerPort,
          },
        })
      }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function fetchLogs(nodeId: string, service: string) {
    setPending(true)
    setError(null)
    try {
      const result = await client.deployments.logs({
        projectId: project.id,
        nodeId,
        serviceName: service,
      })
      setLogs(result.logs)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function copySecrets() {
    await navigator.clipboard.writeText(project.secretsYaml ?? "")
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <AppShell
      user={session.user}
      title={project.name}
      description={`Status ${project.status}${project.errorMessage ? ` · ${project.errorMessage}` : ""}`}
      actions={
        <>
          <StatusBadge status={project.status} />
          <Dialog>
            <DialogTrigger
              render={
                <Button variant="destructive" size="sm" disabled={pending} />
              }
            >
              <Trash2Icon data-icon="inline-start" />
              Destroy
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Destroy {project.name}?</DialogTitle>
                <DialogDescription>
                  This permanently deletes the Postgres database, Redis
                  namespace, S3 bucket, and running containers for this project.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>
                  Cancel
                </DialogClose>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={destroyProject}
                >
                  {pending ? "Destroying…" : "Destroy project"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground hover:underline">
          Projects
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{project.name}</span>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="secrets" className="w-full">
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="secrets">Secrets</TabsTrigger>
          <TabsTrigger value="deploy">Deploy</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
        </TabsList>

        <TabsContent value="secrets" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>secrets.yaml</CardTitle>
              <CardDescription>
                Connection material for this project. Stored encrypted at rest;
                download for local tools. App containers receive rewritten
                Docker DNS URLs on deploy.
              </CardDescription>
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={copySecrets}
              >
                <CopyIcon data-icon="inline-start" />
                {copied ? "Copied" : "Copy"}
              </Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-72 rounded-lg border bg-muted/40">
                <pre className="p-4 font-mono text-xs leading-relaxed whitespace-pre">
                  {project.secretsYaml || "(no secrets)"}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deploy" className="mt-4 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Deploy</CardTitle>
              <CardDescription>
                Prebuilt image, Dockerfile, or Railpack source on the local
                Docker node.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={mode === "image" ? "default" : "outline"}
                  onClick={() => setMode("image")}
                >
                  Prebuilt image
                </Button>
                <Button
                  size="sm"
                  variant={mode === "source" ? "default" : "outline"}
                  onClick={() => setMode("source")}
                >
                  Source (Dockerfile / Railpack)
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="service-name">Service name</Label>
                  <Input
                    id="service-name"
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                  />
                </div>

                {mode === "image" ? (
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label htmlFor="image">Image</Label>
                    <Input
                      id="image"
                      value={image}
                      onChange={(e) => setImage(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label htmlFor="source-path">Absolute source path</Label>
                    <Input
                      id="source-path"
                      value={sourcePath}
                      onChange={(e) => setSourcePath(e.target.value)}
                      placeholder="/path/to/app"
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Dockerfile present → docker build; otherwise Railpack.
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="host-port">Host port</Label>
                  <Input
                    id="host-port"
                    type="number"
                    value={publishPort}
                    onChange={(e) => setPublishPort(Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="container-port">Container port</Label>
                  <Input
                    id="container-port"
                    type="number"
                    value={containerPort}
                    onChange={(e) => setContainerPort(Number(e.target.value))}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button disabled={pending} onClick={deploy}>
                <RocketIcon data-icon="inline-start" />
                {pending ? "Working…" : "Deploy to local Docker"}
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deployments</CardTitle>
              <CardDescription>
                Running and past deploys for this project.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {deployments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No deployments yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">
                        Image / strategy
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deployments.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">
                          {d.serviceName}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={d.status} />
                        </TableCell>
                        <TableCell className="hidden max-w-[220px] truncate font-mono text-xs text-muted-foreground md:table-cell">
                          {d.buildStrategy ? `${d.buildStrategy} · ` : ""}
                          {d.image}
                          {d.errorMessage ? ` · ${d.errorMessage}` : ""}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() => fetchLogs(d.nodeId, d.serviceName)}
                          >
                            Logs
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {logs ? (
                <>
                  <Separator />
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Container logs
                    </p>
                    <ScrollArea className="h-56 rounded-lg border bg-muted/40">
                      <pre className="p-3 font-mono text-xs whitespace-pre-wrap">
                        {logs}
                      </pre>
                    </ScrollArea>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backups" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Postgres backups</CardTitle>
              <CardDescription>
                On-demand dumps and the in-process schedule (default daily;
                configurable via DEPLOW_BACKUP_DEFAULT_INTERVAL_MS).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Interval</p>
                  <p className="font-medium">
                    every {Math.round(schedule.intervalMs / 1000)}s
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Scheduler</p>
                  <p className="font-medium">
                    {schedule.scheduled ? "Active" : "Not running"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last backup</p>
                  <p className="font-medium">
                    {schedule.lastBackupAt
                      ? new Date(schedule.lastBackupAt).toLocaleString()
                      : "None yet"}
                  </p>
                </div>
              </div>

              {backups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No backups yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Storage key</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backups.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell>
                          <StatusBadge status={b.status} />
                          {b.errorMessage ? (
                            <p className="mt-1 text-xs text-destructive">
                              {b.errorMessage}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate font-mono text-xs">
                          {b.storageKey}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {b.sizeBytes ? `${b.sizeBytes} B` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            <CardFooter>
              <Button size="sm" disabled={pending} onClick={runBackup}>
                <DatabaseBackupIcon data-icon="inline-start" />
                {pending ? "Running…" : "Run Postgres backup"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  )
}
