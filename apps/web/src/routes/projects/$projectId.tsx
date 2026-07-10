import { useEffect, useState } from "react"
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import {
  CopyIcon,
  DatabaseBackupIcon,
  DownloadIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  RocketIcon,
  RotateCcwIcon,
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

    const [project, deployments, backups, schedule] = await Promise.all([
      client.projects.get({ id: params.projectId }),
      client.deployments.list({ projectId: params.projectId }),
      client.projects.listBackups({ id: params.projectId }),
      client.projects.backupSchedule({ id: params.projectId }),
    ])
    return { session, project, deployments, backups, schedule }
  },
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { session, project, deployments, backups, schedule } =
    Route.useLoaderData()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string | null>(null)
  const [selectedDeployId, setSelectedDeployId] = useState<string | null>(
    deployments[0]?.id ?? null,
  )
  const [mode, setMode] = useState<"source" | "image">("source")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [image, setImage] = useState("")
  const [sourcePath, setSourcePath] = useState("")
  const [containerPort, setContainerPort] = useState(80)
  const [publishPort, setPublishPort] = useState<number | "">("")
  const [copied, setCopied] = useState<"url" | "secrets" | null>(null)
  const [gitRepoUrl, setGitRepoUrl] = useState(project.git?.repoUrl ?? "")
  const [gitBranch, setGitBranch] = useState(project.git?.branch ?? "main")
  const [gitProvider, setGitProvider] = useState<"github" | "gitlab">(
    (project.git?.provider as "github" | "gitlab") || "github",
  )
  const [webhookSecretShown, setWebhookSecretShown] = useState<string | null>(
    null,
  )

  const latest = deployments[0]
  const selected =
    deployments.find((d) => d.id === selectedDeployId) ?? latest ?? null
  const appStatus: string = latest?.status ?? "ready"
  const appDetail = latest
    ? latest.status === "running"
      ? "Running"
      : latest.errorMessage || latest.status
    : "Not deployed"

  // Poll while deploy is in flight
  useEffect(() => {
    const active = deployments.some((d) =>
      ["queued", "pending", "building", "deploying"].includes(d.status),
    )
    if (!active) return
    const t = setInterval(() => {
      void router.invalidate()
    }, 2500)
    return () => clearInterval(t)
  }, [deployments, router])

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
    setLogs(null)
    try {
      const options: {
        containerPort?: number
        publishPort?: number
        image?: string
      } = {
        containerPort,
      }
      if (publishPort !== "") options.publishPort = Number(publishPort)

      let result
      if (mode === "image") {
        if (!image.trim()) throw new Error("Image is required")
        result = await client.deployments.create({
          projectId: project.id,
          serviceName: "app",
          image: image.trim(),
          options: { ...options, image: image.trim() },
        })
      } else {
        if (!sourcePath.trim()) throw new Error("Source path is required")
        result = await client.deployments.create({
          projectId: project.id,
          serviceName: "app",
          sourcePath: sourcePath.trim(),
          options,
        })
      }
      setSelectedDeployId(result.id)
      if (result.buildLogs) setLogs(result.buildLogs)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function retryDeploy(id: string) {
    setPending(true)
    setError(null)
    try {
      const result = await client.deployments.retry({ id })
      setSelectedDeployId(result.id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function rollback() {
    setPending(true)
    setError(null)
    try {
      const result = await client.deployments.rollback({
        projectId: project.id,
      })
      setSelectedDeployId(result.id)
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

  async function copyText(text: string, kind: "url" | "secrets") {
    await navigator.clipboard.writeText(text)
    setCopied(kind)
    setTimeout(() => setCopied(null), 1500)
  }

  function downloadSecrets() {
    const blob = new Blob([project.secretsYaml ?? ""], {
      type: "text/yaml;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${project.slug}-secrets.yaml`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function connectGit() {
    setPending(true)
    setError(null)
    try {
      const result = await client.projects.connectGit({
        projectId: project.id,
        provider: gitProvider,
        repoUrl: gitRepoUrl.trim(),
        branch: gitBranch.trim() || "main",
      })
      setWebhookSecretShown(result.webhookSecret)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function disconnectGit() {
    setPending(true)
    setError(null)
    try {
      await client.projects.disconnectGit({ projectId: project.id })
      setWebhookSecretShown(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <AppShell
      user={session.user}
      title={project.name}
      description="Your app plus Postgres, Redis, and S3. Deploy source; we inject credentials, give you a URL, and back up Postgres."
      actions={
        <>
          <StatusBadge status={project.status} />
          <Button size="sm" disabled={pending} onClick={() => void deploy()}>
            <RocketIcon data-icon="inline-start" />
            {pending ? "Working…" : "Deploy"}
          </Button>
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
                  Permanently deletes the production Postgres database, Redis
                  namespace, S3 bucket, proxy route, and running containers.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>
                  Cancel
                </DialogClose>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => void destroyProject()}
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
          <AlertDescription className="whitespace-pre-wrap">
            {error}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Public URL hero */}
      {project.publicUrl ? (
        <Card size="sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                Public URL
              </p>
              <a
                href={project.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 truncate font-mono text-sm font-medium hover:underline"
              >
                {project.publicUrl}
                <ExternalLinkIcon className="size-3.5 shrink-0" />
              </a>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copyText(project.publicUrl!, "url")}
            >
              <CopyIcon data-icon="inline-start" />
              {copied === "url" ? "Copied" : "Copy URL"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <AlertTitle>URL ready after first deploy</AlertTitle>
          <AlertDescription>
            Set <code className="text-xs">DEPLOW_BASE_DOMAIN</code> and point a
            wildcard at cloudflared once. After deploy, your app is served at{" "}
            <code className="text-xs">
              https://{project.slug}.{"{baseDomain}"}
            </code>
            .
          </AlertDescription>
        </Alert>
      )}

      {/* Stack summary tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StackTile
          title="App"
          status={latest ? appStatus : "ready"}
          detail={appDetail}
        />
        <StackTile
          title="Postgres"
          status={project.hasCredentials ? "ready" : "pending"}
          detail={project.hasCredentials ? "Production slot" : "Provisioning"}
        />
        <StackTile
          title="Redis"
          status={project.hasCredentials ? "ready" : "pending"}
          detail={project.hasCredentials ? "Production slot" : "Provisioning"}
        />
        <StackTile
          title="S3"
          status={project.hasCredentials ? "ready" : "pending"}
          detail={project.hasCredentials ? "Production slot" : "Provisioning"}
        />
        <StackTile
          title="Backups"
          status={schedule.scheduled ? "ready" : "pending"}
          detail={
            schedule.lastBackupAt
              ? `Last ${new Date(schedule.lastBackupAt).toLocaleString()}`
              : "Scheduled daily"
          }
        />
      </div>

      {/* Secrets hero */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>secrets.yaml</CardTitle>
            <CardDescription>
              Use these env vars locally against provisioned infra. App
              containers get Docker-network URLs injected on deploy — you never
              assemble DATABASE_URL yourself.
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void copyText(project.secretsYaml ?? "", "secrets")
              }
            >
              <CopyIcon data-icon="inline-start" />
              {copied === "secrets" ? "Copied" : "Copy"}
            </Button>
            <Button size="sm" onClick={downloadSecrets}>
              <DownloadIcon data-icon="inline-start" />
              Download
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="deploy" className="w-full">
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="deploy">Deploy</TabsTrigger>
          <TabsTrigger value="git">Git</TabsTrigger>
          <TabsTrigger value="secrets">Secrets</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
        </TabsList>

        <TabsContent value="deploy" className="mt-4 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Deploy</CardTitle>
              <CardDescription>
                Point at your source. We detect Dockerfile or use Railpack
                automatically — no builder picker.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={mode === "source" ? "default" : "outline"}
                  onClick={() => setMode("source")}
                >
                  Source
                </Button>
                <Button
                  size="sm"
                  variant={mode === "image" ? "default" : "outline"}
                  onClick={() => {
                    setMode("image")
                    setShowAdvanced(true)
                  }}
                >
                  Image (advanced)
                </Button>
              </div>

              {mode === "source" ? (
                <div className="flex flex-col gap-1.5">
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
                    Credentials are injected automatically.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="image">Container image</Label>
                  <Input
                    id="image"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    placeholder="ghcr.io/you/app:latest"
                    className="font-mono"
                  />
                </div>
              )}

              <button
                type="button"
                className="text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                {showAdvanced ? "Hide advanced" : "Show advanced options"}
              </button>

              {showAdvanced ? (
                <div className="grid gap-4 rounded-lg border p-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="container-port">Container port</Label>
                    <Input
                      id="container-port"
                      type="number"
                      value={containerPort}
                      onChange={(e) => setContainerPort(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="host-port">
                      Host port{" "}
                      <span className="font-normal text-muted-foreground">
                        (optional)
                      </span>
                    </Label>
                    <Input
                      id="host-port"
                      type="number"
                      value={publishPort}
                      onChange={(e) =>
                        setPublishPort(
                          e.target.value === "" ? "" : Number(e.target.value),
                        )
                      }
                      placeholder="omit for proxy-only"
                    />
                  </div>
                </div>
              ) : null}
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              <Button disabled={pending} onClick={() => void deploy()}>
                <RocketIcon data-icon="inline-start" />
                {pending ? "Deploying…" : "Deploy"}
              </Button>
              {latest?.status === "failed" ? (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => void retryDeploy(latest.id)}
                >
                  <RotateCcwIcon data-icon="inline-start" />
                  Retry
                </Button>
              ) : null}
              {deployments.filter((d) => d.image).length >= 2 ? (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => void rollback()}
                >
                  <RotateCcwIcon data-icon="inline-start" />
                  Roll back
                </Button>
              ) : null}
            </CardFooter>
          </Card>

          {/* Living deployment detail */}
          {selected ? (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      Deployment {selected.id.slice(0, 8)}
                    </CardTitle>
                    <CardDescription>
                      {selected.buildStrategy ?? "—"}
                      {selected.image ? ` · ${selected.image}` : ""}
                      {selected.triggeredBy
                        ? ` · via ${selected.triggeredBy}`
                        : ""}
                    </CardDescription>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {selected.errorMessage ? (
                  <Alert variant="destructive">
                    <AlertTitle>Deploy failed</AlertTitle>
                    <AlertDescription className="whitespace-pre-wrap">
                      {selected.errorMessage}
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      void fetchLogs(selected.nodeId, selected.serviceName)
                    }
                  >
                    View logs
                  </Button>
                  {selected.status === "failed" ? (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => void retryDeploy(selected.id)}
                    >
                      Retry
                    </Button>
                  ) : null}
                </div>
                {logs || selected.buildLogs ? (
                  <ScrollArea className="h-56 rounded-lg border bg-muted/40">
                    <pre className="p-3 font-mono text-xs whitespace-pre-wrap">
                      {logs || selected.buildLogs}
                    </pre>
                  </ScrollArea>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
              <CardDescription>
                Recent deploys for this project.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {deployments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No deployments yet. Deploy source to go live.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">
                        Image / strategy
                      </TableHead>
                      <TableHead className="text-right">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deployments.map((d) => (
                      <TableRow
                        key={d.id}
                        className="cursor-pointer"
                        onClick={() => {
                          setSelectedDeployId(d.id)
                          setLogs(d.buildLogs)
                        }}
                      >
                        <TableCell>
                          <StatusBadge status={d.status} />
                        </TableCell>
                        <TableCell className="hidden max-w-[280px] truncate font-mono text-xs text-muted-foreground md:table-cell">
                          {d.buildStrategy ? `${d.buildStrategy} · ` : ""}
                          {d.image}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {new Date(d.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="git" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranchIcon className="size-4" />
                Push to deploy
              </CardTitle>
              <CardDescription>
                Connect a GitHub or GitLab repo. Every push to the production
                branch builds and deploys this project.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {project.git?.connected ? (
                <>
                  <div className="grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="font-medium">
                        Connected · {project.git.provider}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Branch</p>
                      <p className="font-mono text-sm">{project.git.branch}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground">
                        Repository
                      </p>
                      <p className="truncate font-mono text-xs">
                        {project.git.repoUrl}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground">
                        Webhook URL
                      </p>
                      <p className="break-all font-mono text-xs">
                        {project.git.webhookUrl}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Last delivery
                      </p>
                      <p className="font-medium">
                        {project.git.lastDeliveryStatus ?? "None yet"}
                        {project.git.lastDeliveryAt
                          ? ` · ${new Date(project.git.lastDeliveryAt).toLocaleString()}`
                          : ""}
                      </p>
                      {project.git.lastDeliveryError ? (
                        <p className="mt-1 text-xs text-destructive">
                          {project.git.lastDeliveryError}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {webhookSecretShown ? (
                    <Alert>
                      <AlertTitle>Webhook secret (copy now)</AlertTitle>
                      <AlertDescription className="font-mono text-xs break-all">
                        {webhookSecretShown}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => void disconnectGit()}
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="git-provider">Provider</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          gitProvider === "github" ? "default" : "outline"
                        }
                        onClick={() => setGitProvider("github")}
                      >
                        GitHub
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          gitProvider === "gitlab" ? "default" : "outline"
                        }
                        onClick={() => setGitProvider("gitlab")}
                      >
                        GitLab
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="git-repo">Repository URL</Label>
                    <Input
                      id="git-repo"
                      value={gitRepoUrl}
                      onChange={(e) => setGitRepoUrl(e.target.value)}
                      placeholder="https://github.com/you/app.git"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="git-branch">Production branch</Label>
                    <Input
                      id="git-branch"
                      value={gitBranch}
                      onChange={(e) => setGitBranch(e.target.value)}
                      placeholder="main"
                    />
                  </div>
                  <Button
                    disabled={pending || !gitRepoUrl.trim()}
                    onClick={() => void connectGit()}
                  >
                    Connect repository
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="secrets" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>secrets.yaml</CardTitle>
              <CardDescription>
                Host-facing connection material. Containers receive rewritten
                Docker DNS URLs on deploy.
              </CardDescription>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void copyText(project.secretsYaml ?? "", "secrets")
                  }
                >
                  <CopyIcon data-icon="inline-start" />
                  {copied === "secrets" ? "Copied" : "Copy"}
                </Button>
                <Button size="sm" onClick={downloadSecrets}>
                  <DownloadIcon data-icon="inline-start" />
                  Download
                </Button>
              </div>
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

        <TabsContent value="backups" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Postgres backups</CardTitle>
              <CardDescription>
                On-demand dumps and the in-process schedule (default daily).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Interval</p>
                  <p className="font-medium">
                    every {Math.round(schedule.intervalMs / 3_600_000)}h
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
              <Button
                size="sm"
                disabled={pending}
                onClick={() => void runBackup()}
              >
                <DatabaseBackupIcon data-icon="inline-start" />
                {pending ? "Running…" : "Run Postgres backup"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
      <Separator className="opacity-0" />
    </AppShell>
  )
}

function StackTile({
  title,
  status,
  detail,
}: {
  title: string
  status: string
  detail: string
}) {
  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <StatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}
