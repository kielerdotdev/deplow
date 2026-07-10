import { useEffect, useState } from "react"
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import {
  BoxIcon,
  CopyIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  HardDriveIcon,
  MoreHorizontalIcon,
  RocketIcon,
  ScrollTextIcon,
  Trash2Icon,
  WorkflowIcon,
} from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { AppSheetBody, InfraSheetBody } from "@/components/project-app-sheet"
import { AppShell } from "@/components/app-shell"
import { EmptyState } from "@/components/empty-state"
import { DeploymentsPanel } from "@/components/project-deployments-panel"
import { ProjectRail, type ProjectSection } from "@/components/project-rail"
import { ProjectSettings } from "@/components/project-settings"
import { BackupsPanel } from "@/components/project-backups-panel"
import { SecretsPanel } from "@/components/project-secrets-panel"
import { StackCard } from "@/components/stack-card"
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import {
  repoShortName,
  summarizeDeployError,
  formatDateTime,
} from "@/lib/ui-format"

type StackTarget = "app" | "postgres" | "redis" | "s3"

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
  const [section, setSection] = useState<ProjectSection>("overview")
  const [stackTarget, setStackTarget] = useState<StackTarget | null>(null)
  const [destroyOpen, setDestroyOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string | null>(null)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logsTitle, setLogsTitle] = useState("Logs")
  const [selectedDeployId, setSelectedDeployId] = useState<string | null>(
    deployments[0]?.id ?? null,
  )
  const [mode, setMode] = useState<"git" | "source" | "image">(
    project.git?.connected ? "git" : "source",
  )
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [image, setImage] = useState("")
  const [sourcePath, setSourcePath] = useState("")
  const [containerPort, setContainerPort] = useState(80)
  const [publishPort, setPublishPort] = useState<number | "">("")
  const [copied, setCopied] = useState<"url" | "secrets" | "webhook" | null>(
    null,
  )
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
  const appStatus = latest?.status ?? "ready"
  const appDetail = !latest
    ? "Not deployed · Deploy to go live under gVisor"
    : latest.status === "running"
      ? "Online · gVisor sandbox"
      : ["building", "deploying", "queued", "pending"].includes(latest.status)
        ? latest.status
        : latest.status === "failed"
          ? summarizeDeployError(
              latest.errorMessage || latest.buildLogs || "Build failed",
            )
          : latest.status
  const canDeploy = project.git?.connected
    ? mode === "source"
      ? Boolean(sourcePath.trim()) || !showAdvanced
      : mode === "image"
        ? Boolean(image.trim()) || !showAdvanced
        : true
    : mode === "source"
      ? Boolean(sourcePath.trim())
      : mode === "image"
        ? Boolean(image.trim())
        : false
  const repoLabel = repoShortName(project.git?.repoUrl)
  const infraReady = project.hasCredentials
  const infraStatus = infraReady ? "ready" : "pending"
  const infraDetail = infraReady ? "Provisioned" : "Provisioning"

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
      setDestroyOpen(false)
    }
  }

  async function deploy(forceMode?: "git" | "source" | "image") {
    const effectiveMode = forceMode ?? mode
    setPending(true)
    setError(null)
    setLogs(null)
    try {
      const options: {
        containerPort?: number
        publishPort?: number
        image?: string
      } = { containerPort }
      if (publishPort !== "") options.publishPort = Number(publishPort)

      let result
      if (effectiveMode === "git") {
        if (!project.git?.connected) {
          throw new Error("Connect a Git repository first")
        }
        result = await client.deployments.create({
          projectId: project.id,
          serviceName: "app",
          fromGit: true,
          options,
        })
      } else if (effectiveMode === "image") {
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
      setStackTarget("app")
      setSection("overview")
      if (result.buildLogs) {
        openLogs(`Build · ${result.id.slice(0, 8)}`, result.buildLogs)
      }
      await refresh()
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      setError(raw)
      openLogs("Deploy failed", raw)
    } finally {
      setPending(false)
    }
  }

  function openLogs(title: string, content: string | null | undefined) {
    setLogsTitle(title)
    setLogs(content ?? null)
    setLogsOpen(true)
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

  async function fetchLogs(nodeId: string, service: string, deployId?: string) {
    setPending(true)
    setError(null)
    openLogs(
      deployId ? `Runtime · ${deployId.slice(0, 8)}` : "Runtime logs",
      "Loading…",
    )
    try {
      const result = await client.deployments.logs({
        projectId: project.id,
        nodeId,
        serviceName: service,
      })
      setLogs(result.logs || "(no log output)")
    } catch (e) {
      setLogsOpen(false)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function copyText(text: string, kind: "url" | "secrets" | "webhook") {
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

  async function connectGit(selection?: {
    provider: "github" | "gitlab"
    repoUrl: string
    branch: string
  }) {
    const provider = selection?.provider ?? gitProvider
    const repoUrl = (selection?.repoUrl ?? gitRepoUrl).trim()
    const branch = (selection?.branch ?? gitBranch).trim() || "main"
    if (!repoUrl) {
      setError("Select a repository first")
      return
    }
    setPending(true)
    setError(null)
    try {
      setGitProvider(provider)
      setGitRepoUrl(repoUrl)
      setGitBranch(branch)
      const result = await client.projects.connectGit({
        projectId: project.id,
        provider,
        repoUrl,
        branch,
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

  function openStack(target: StackTarget) {
    setStackTarget(target)
    setSection("overview")
    if (target === "app" && !project.git?.connected) {
      setShowAdvanced(false)
      setMode(project.git?.connected ? "git" : "source")
    }
  }

  const backupMeta = schedule.lastBackupAt
    ? `Last backup ${formatDateTime(schedule.lastBackupAt)}`
    : schedule.scheduled
      ? "Daily backups scheduled"
      : "Backups not scheduled"

  return (
    <AppShell
      user={session.user}
      title={project.name}
      description={
        project.publicUrl
          ? project.publicUrl.replace(/^https?:\/\//, "")
          : "Deploy to get a public URL"
      }
      actions={
        <>
          <StatusBadge status={latest?.status ?? project.status} />
          <Button
            size="sm"
            disabled={pending || !canDeploy}
            data-primary-action="deploy"
            onClick={() => {
              setStackTarget("app")
              void deploy(
                project.git?.connected && mode === "git"
                  ? "git"
                  : mode === "image"
                    ? "image"
                    : project.git?.connected
                      ? "git"
                      : mode,
              )
            }}
          >
            <RocketIcon data-icon="inline-start" />
            {pending ? "Working…" : "Deploy"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" />}
            >
              <MoreHorizontalIcon className="size-4" />
              <span className="sr-only">More actions</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDestroyOpen(true)}
              >
                <Trash2Icon />
                Destroy project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
          <AlertTitle>Deploy failed</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{summarizeDeployError(error)}</span>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => openLogs("Deploy failed", error)}
            >
              View details
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <ProjectRail value={section} onChange={setSection} />

        <div className="min-w-0 flex-1 flex flex-col gap-4">
          {section === "overview" ? (
            <>
              {project.publicUrl ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-4 py-3">
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
                    {copied === "url" ? "Copied" : "Copy"}
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/80 px-4 py-3 text-sm text-muted-foreground">
                  No public URL yet. Deploy the app (and set{" "}
                  <code className="text-xs">DEPLOW_BASE_DOMAIN</code> for
                  wildcard HTTPS via Caddy + cloudflared).
                </div>
              )}

              {project.git?.connected && repoLabel ? (
                <button
                  type="button"
                  onClick={() => setSection("settings")}
                  className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                      <GitBranchIcon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {repoLabel}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {project.git.branch ?? "main"} · push to deploy ·
                        Settings
                      </p>
                    </div>
                  </div>
                  <StatusBadge status="connected" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSection("settings")}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-border/80 px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/20"
                >
                  <div>
                    <p className="text-sm font-medium">Connect a repository</p>
                    <p className="text-xs text-muted-foreground">
                      Open Settings · Source — push to deploy
                    </p>
                  </div>
                  <GitBranchIcon className="size-4 shrink-0 text-muted-foreground" />
                </button>
              )}

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StackCard
                  title="App"
                  icon={BoxIcon}
                  status={latest ? appStatus : "ready"}
                  detail={appDetail}
                  selected={stackTarget === "app"}
                  onClick={() => openStack("app")}
                />
                <StackCard
                  title="Postgres"
                  icon={DatabaseIcon}
                  status={infraStatus}
                  detail={infraDetail}
                  selected={stackTarget === "postgres"}
                  onClick={() => openStack("postgres")}
                />
                <StackCard
                  title="Redis"
                  icon={WorkflowIcon}
                  status={infraStatus}
                  detail={infraDetail}
                  selected={stackTarget === "redis"}
                  onClick={() => openStack("redis")}
                />
                <StackCard
                  title="S3"
                  icon={HardDriveIcon}
                  status={infraStatus}
                  detail={infraDetail}
                  selected={stackTarget === "s3"}
                  onClick={() => openStack("s3")}
                />
              </div>
              <p className="text-xs text-muted-foreground">{backupMeta}</p>
            </>
          ) : null}

          {section === "deployments" ? (
            <DeploymentsPanel
              deployments={deployments}
              selectedId={selected?.id ?? null}
              pending={pending}
              onSelect={setSelectedDeployId}
              onViewLogs={(d) => {
                if (d.buildLogs) {
                  openLogs(`Build · ${d.id.slice(0, 8)}`, d.buildLogs)
                } else {
                  void fetchLogs(d.nodeId, d.serviceName, d.id)
                }
              }}
              onRetry={(id) => void retryDeploy(id)}
              onOpenDeploy={() => {
                setSection("overview")
                setStackTarget("app")
              }}
            />
          ) : null}

          {section === "logs" ? (
            <Card>
              <CardHeader>
                <CardTitle>Logs</CardTitle>
                <CardDescription>
                  Build and runtime output for the selected deployment.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selected ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={selected.status} />
                      <span className="font-mono text-xs text-muted-foreground">
                        {selected.id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          void fetchLogs(
                            selected.nodeId,
                            selected.serviceName,
                            selected.id,
                          )
                        }
                      >
                        <ScrollTextIcon data-icon="inline-start" />
                        Runtime logs
                      </Button>
                      {selected.buildLogs ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            openLogs(
                              `Build · ${selected.id.slice(0, 8)}`,
                              selected.buildLogs,
                            )
                          }
                        >
                          Build output
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    size="sm"
                    icon={ScrollTextIcon}
                    title="No deployments yet"
                    description="Deploy once to stream build and runtime logs here."
                    action={
                      <Button
                        size="sm"
                        onClick={() => {
                          setSection("overview")
                          setStackTarget("app")
                        }}
                      >
                        Open deploy
                      </Button>
                    }
                  />
                )}
              </CardContent>
            </Card>
          ) : null}

          {section === "settings" ? (
            <ProjectSettings
              projectName={project.name}
              projectSlug={project.slug}
              publicUrl={project.publicUrl}
              git={project.git}
              pending={pending}
              gitProvider={gitProvider}
              setGitProvider={setGitProvider}
              gitRepoUrl={gitRepoUrl}
              setGitRepoUrl={setGitRepoUrl}
              gitBranch={gitBranch}
              setGitBranch={setGitBranch}
              webhookSecretShown={webhookSecretShown}
              copied={copied}
              onCopyUrl={(url) => void copyText(url, "url")}
              onCopyWebhook={(url) => void copyText(url, "webhook")}
              onConnect={(sel) => void connectGit(sel)}
              onDisconnect={() => void disconnectGit()}
              onDeploy={() => {
                setMode("git")
                void deploy("git")
              }}
            />
          ) : null}

          {section === "secrets" ? (
            <SecretsPanel
              secretsYaml={project.secretsYaml}
              copied={copied === "secrets"}
              onCopy={() => void copyText(project.secretsYaml ?? "", "secrets")}
              onDownload={downloadSecrets}
            />
          ) : null}

          {section === "backups" ? (
            <BackupsPanel
              schedule={schedule}
              backups={backups}
              pending={pending}
              onRun={() => void runBackup()}
            />
          ) : null}
        </div>
      </div>

      <Sheet
        open={stackTarget !== null}
        onOpenChange={(open) => {
          if (!open) setStackTarget(null)
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 sm:max-w-xl"
          showCloseButton
        >
          <SheetHeader className="border-b pr-12">
            <SheetTitle className="capitalize">
              {stackTarget === "app" ? project.name : stackTarget}
            </SheetTitle>
            <SheetDescription>
              {stackTarget === "app"
                ? project.git?.connected
                  ? deployments.length === 0
                    ? "Ready to deploy from your connected repository."
                    : "Live status, deploy, and recent history."
                  : "Connect a Git repo first — then deploy in one click."
                : "Bundled with this project. Credentials live under Secrets."}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-4 p-4">
              {stackTarget === "app" ? (
                <AppSheetBody
                  gitConnected={Boolean(project.git?.connected)}
                  repoLabel={repoLabel}
                  gitBranch={project.git?.branch ?? "main"}
                  mode={mode}
                  setMode={setMode}
                  showAdvanced={showAdvanced}
                  setShowAdvanced={setShowAdvanced}
                  sourcePath={sourcePath}
                  setSourcePath={setSourcePath}
                  image={image}
                  setImage={setImage}
                  containerPort={containerPort}
                  setContainerPort={setContainerPort}
                  publishPort={publishPort}
                  setPublishPort={setPublishPort}
                  pending={pending}
                  canDeploy={canDeploy}
                  latest={latest}
                  selected={selected}
                  deployments={deployments}
                  onDeploy={(force) => void deploy(force)}
                  onRetry={(id) => void retryDeploy(id)}
                  onRollback={() => void rollback()}
                  onFetchLogs={(d) =>
                    void fetchLogs(d.nodeId, d.serviceName, d.id)
                  }
                  onSelectDeploy={setSelectedDeployId}
                  onConnectGit={() => {
                    setStackTarget(null)
                    setSection("settings")
                  }}
                  onViewDeployments={() => {
                    setStackTarget(null)
                    setSection("deployments")
                  }}
                />
              ) : stackTarget ? (
                <InfraSheetBody
                  name={stackTarget}
                  ready={infraReady}
                  onOpenSecrets={() => {
                    setStackTarget(null)
                    setSection("secrets")
                  }}
                />
              ) : null}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Dialog open={destroyOpen} onOpenChange={setDestroyOpen}>
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

      <ActionDialog
        open={logsOpen}
        onOpenChange={setLogsOpen}
        title={logsTitle}
        description="Build and runtime output for this deployment."
        size="xl"
        contentClassName="max-h-[85vh]"
        footer={
          <Button variant="outline" onClick={() => setLogsOpen(false)}>
            Close
          </Button>
        }
      >
        <ScrollArea className="h-[min(28rem,55vh)] rounded-lg border bg-muted/40">
          <pre className="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {logs || "(no output)"}
          </pre>
        </ScrollArea>
      </ActionDialog>
    </AppShell>
  )
}
