import { useEffect, useRef, useState } from "react"
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  CableIcon,
  CopyIcon,
  LinkIcon,
  RocketIcon,
  ScrollTextIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { z } from "zod"

import { ActionDialog } from "@/components/action-dialog"
import { AppShell } from "@/components/app-shell"
import { BackupsPanel } from "@/components/backups-panel"
import { DatabasePanel } from "@/components/database-panel"
import { LogViewer } from "@/components/log-viewer"
import { PageSection } from "@/components/page-section"
import { ServiceGitPanel } from "@/components/service-git-panel"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSession } from "@/lib/auth.functions"
import { useLogStream } from "@/hooks/use-log-stream"
import { client } from "@/lib/orpc"

const serviceSearchSchema = z.object({
  tab: z
    .enum([
      "overview",
      "deployments",
      "logs",
      "connections",
      "database",
      "backups",
      "settings",
    ])
    .optional()
    .catch("overview"),
})

export const Route = createFileRoute(
  "/projects/$projectId_/services/$serviceId",
)({
  validateSearch: (search) => serviceSearchSchema.parse(search),
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) throw redirect({ to: "/login" })
    const [project, service, deployments, operations] = await Promise.all([
      client.projects.get({ id: params.projectId }),
      client.services.get({ id: params.serviceId }),
      client.deployments.list({ serviceId: params.serviceId }),
      client.operations.list({ serviceId: params.serviceId }),
    ])
    if (service.projectId !== project.id) {
      throw redirect({
        to: "/projects/$projectId",
        params: { projectId: params.projectId },
      })
    }
    const isData = service.type === "postgres" || service.type === "redis"
    const [dbOverview, backups, pitr] = isData
      ? await Promise.all([
          client.projects.databaseOverview({ id: params.projectId }),
          client.projects.listBackups({ id: params.projectId }),
          client.projects.pitrStatus({ id: params.projectId }),
        ])
      : [null, [], null]
    return {
      session,
      project,
      service,
      deployments,
      operations,
      dbOverview,
      backups,
      pitr,
    }
  },
  component: ServicePage,
})

type Tab =
  | "overview"
  | "deployments"
  | "logs"
  | "connections"
  | "database"
  | "backups"
  | "settings"

function ServicePage() {
  const {
    session,
    project,
    service,
    deployments,
    operations,
    dbOverview,
    backups,
    pitr,
  } = Route.useLoaderData()
  const { tab: tabParam } = Route.useSearch()
  const tab = (tabParam ?? "overview") as Tab
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logDeploymentId, setLogDeploymentId] = useState<string | null>(null)
  const [followLatest, setFollowLatest] = useState(true)
  const [bindEnvKey, setBindEnvKey] = useState("DATABASE_URL")
  const [bindProviderId, setBindProviderId] = useState("")
  const [destroyOpen, setDestroyOpen] = useState(false)
  const [destroyConfirm, setDestroyConfirm] = useState("")
  const [copiedUrl, setCopiedUrl] = useState(false)

  const isData = service.type === "postgres" || service.type === "redis"
  const isApp = service.type === "web" || service.type === "worker"
  const providers = project.services.filter(
    (s) => s.type === "postgres" || s.type === "redis",
  )

  function setTab(next: Tab) {
    void router.navigate({
      to: "/projects/$projectId/services/$serviceId",
      params: { projectId: project.id, serviceId: service.id },
      search: { tab: next },
      replace: true,
    })
  }

  async function refresh() {
    await router.invalidate()
  }

  const streamKey = followLatest
    ? `latest:${service.id}`
    : `dep:${logDeploymentId ?? "none"}`

  const logStream = useLogStream<{
    header: string
    deploymentId: string | null
  }>({
    enabled: tab === "logs" && isApp,
    watchKey: streamKey,
    intervalMs: 1200,
    fetch: async () => {
      const result = await client.deployments.logs({
        serviceId: service.id,
        deploymentId: followLatest
          ? undefined
          : (logDeploymentId ?? undefined),
      })
      if (result.deploymentId) {
        setLogDeploymentId((prev) =>
          prev === result.deploymentId ? prev : result.deploymentId,
        )
      }
      const statusLabel = result.deploymentStatus
        ? ` · ${result.deploymentStatus}`
        : ""
      const phaseLabel =
        result.phase === "build"
          ? " · build"
          : result.phase === "deploy"
            ? " · deploy"
            : ""
      const body =
        [result.buildLogs, result.logs].filter(Boolean).join("\n\n") ||
        (result.live ? "(waiting for output…)" : "(no output)")
      return {
        body,
        live: Boolean(result.live),
        meta: {
          header: `${result.serviceName}${result.deploymentId ? ` · ${result.deploymentId.slice(0, 8)}` : ""}${statusLabel}${phaseLabel}`,
          deploymentId: result.deploymentId,
        },
      }
    },
  })

  const wasLive = useRef(false)
  useEffect(() => {
    if (tab !== "logs") {
      wasLive.current = false
      return
    }
    if (wasLive.current && !logStream.live) void refresh()
    wasLive.current = logStream.live
  }, [tab, logStream.live])

  function openLogs(deploymentId?: string) {
    if (deploymentId) {
      setLogDeploymentId(deploymentId)
      setFollowLatest(false)
    } else {
      setFollowLatest(true)
    }
    setTab("logs")
  }

  async function deploy() {
    setPending(true)
    setError(null)
    try {
      const created = await client.deployments.create({
        serviceId: service.id,
        fromGit: Boolean(service.git.connected),
      })
      await refresh()
      setLogDeploymentId(created.id)
      setFollowLatest(false)
      setTab("logs")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  async function createBinding() {
    if (!bindProviderId || !bindEnvKey) return
    setPending(true)
    setError(null)
    try {
      await client.bindings.create({
        consumerServiceId: service.id,
        providerServiceId: bindProviderId,
        envKey: bindEnvKey,
      })
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  async function removeBinding(id: string) {
    setPending(true)
    try {
      await client.bindings.destroy({ id })
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }

  async function destroyService() {
    if (destroyConfirm !== service.name) return
    setPending(true)
    try {
      await client.services.destroy({ id: service.id })
      void router.navigate({
        to: "/projects/$projectId",
        params: { projectId: project.id },
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setPending(false)
    }
  }

  const tabs: Array<{ id: Tab; label: string; show: boolean }> = [
    { id: "overview", label: "Overview", show: true },
    { id: "deployments", label: "Deployments", show: isApp },
    { id: "logs", label: "Logs", show: isApp },
    { id: "connections", label: "Connections", show: isApp },
    { id: "database", label: "Database", show: isData },
    { id: "backups", label: "Backups", show: isData },
    { id: "settings", label: "Settings", show: true },
  ]

  return (
    <AppShell
      user={session.user}
      title={service.name}
      description={`${project.name} · ${service.type}`}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeftIcon className="size-3.5" />
              Back to project
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {service.name}
              </h1>
              <StatusBadge status={service.status} />
              <span className="rounded-md border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">
                {service.type}
              </span>
            </div>
            {service.publicUrl ? (
              <div className="flex max-w-xl flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2">
                <a
                  href={service.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 items-center gap-1.5 font-mono text-sm font-medium hover:underline"
                >
                  <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{service.publicUrl}</span>
                </a>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    void navigator.clipboard.writeText(service.publicUrl!)
                    setCopiedUrl(true)
                    window.setTimeout(() => setCopiedUrl(false), 1500)
                  }}
                >
                  <CopyIcon data-icon="inline-start" />
                  {copiedUrl ? "Copied" : "Copy"}
                </Button>
              </div>
            ) : isApp ? (
              <p className="text-sm text-muted-foreground">
                No public URL yet.{" "}
                {service.status === "running" ? (
                  <Link to="/domains" className="underline hover:text-foreground">
                    Configure Domains
                  </Link>
                ) : (
                  <>
                    Deploy to get a URL, or{" "}
                    <Link to="/domains" className="underline hover:text-foreground">
                      set Domains
                    </Link>{" "}
                    first.
                  </>
                )}
              </p>
            ) : null}
            {service.errorMessage ? (
              <Alert variant="destructive">
                <AlertDescription>
                  <p className="font-medium">
                    {service.errorCode === "deploy_failed"
                      ? "Deploy failed"
                      : "Service error"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-xs">
                    {service.errorMessage}
                  </p>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {isApp ? (
              <>
                <Button
                  onClick={() => void deploy()}
                  disabled={pending || !service.git.connected}
                >
                  <RocketIcon data-icon="inline-start" />
                  Deploy
                </Button>
                <Button
                  variant="outline"
                  onClick={() => openLogs()}
                  disabled={pending}
                >
                  <ScrollTextIcon data-icon="inline-start" />
                  Logs
                </Button>
              </>
            ) : null}
            {isData && service.status === "error" ? (
              <Button
                variant="outline"
                onClick={() =>
                  void client.services
                    .retryProvision({ id: service.id })
                    .then(refresh)
                    .catch((cause) =>
                      setError(
                        cause instanceof Error ? cause.message : String(cause),
                      ),
                    )
                }
                disabled={pending}
              >
                Retry provision
              </Button>
            ) : null}
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <nav className="flex flex-wrap gap-1 border-b border-border pb-px">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={
                  tab === t.id
                    ? "border-b-2 border-foreground px-3 py-2 text-sm font-medium"
                    : "px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                }
              >
                {t.label}
              </button>
            ))}
        </nav>

        {tab === "overview" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="surface-panel space-y-2 p-4">
              <p className="text-xs text-muted-foreground">Status</p>
              <StatusBadge status={service.status} />
              {service.lastOperationId ? (
                <p className="font-mono text-[11px] text-muted-foreground">
                  Last operation {service.lastOperationId.slice(0, 8)}
                </p>
              ) : null}
            </div>
            <div className="surface-panel space-y-2 p-4">
              <p className="text-xs text-muted-foreground">Recent operations</p>
              {operations.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet</p>
              ) : (
                operations.slice(0, 5).map((op) => (
                  <div
                    key={op.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="capitalize">{op.type}</span>
                    <StatusBadge status={op.status} />
                  </div>
                ))
              )}
            </div>
            {isApp ? (
              <div className="sm:col-span-2">
                <ServiceGitPanel
                  serviceId={service.id}
                  git={service.git}
                  onChanged={refresh}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "deployments" ? (
          <div className="surface-panel divide-y divide-border">
            {deployments.length === 0 ? (
              <p className="px-4 py-8 text-sm text-muted-foreground">
                No deployments yet
              </p>
            ) : (
              deployments.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">
                      {d.serviceName}
                      {d.gitSha ? (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {d.gitSha.slice(0, 7)}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.createdAt}
                      {d.failedStage ? ` · failed at ${d.failedStage}` : ""}
                      {d.buildStrategy ? ` · ${d.buildStrategy}` : ""}
                    </p>
                    {d.errorMessage ? (
                      <p className="text-xs text-destructive">{d.errorMessage}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={d.status} />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openLogs(d.id)}
                    >
                      Logs
                    </Button>
                    {d.status === "failed" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          void client.deployments
                            .retry({ id: d.id })
                            .then(refresh)
                        }
                      >
                        Retry
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "logs" ? (
          <div className="surface-panel p-4">
            {logStream.error ? (
              <Alert variant="destructive" className="mb-3">
                <AlertDescription>{logStream.error}</AlertDescription>
              </Alert>
            ) : null}
            <LogViewer
              title={logStream.meta?.header ?? service.name}
              body={logStream.body}
              live={logStream.live}
              loading={logStream.loading}
              empty="Open a deployment or wait for output…"
              actions={
                !followLatest ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFollowLatest(true)
                    }}
                  >
                    Follow latest
                  </Button>
                ) : null
              }
            />
          </div>
        ) : null}

        {tab === "connections" ? (
          <PageSection
            icon={CableIcon}
            title="Resource bindings"
            description="Explicit connections inject credentials as environment variables on the next deploy."
          >
            <div className="space-y-4">
              <div className="surface-panel divide-y divide-border">
                {(service.bindings ?? []).length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    No bindings yet. Apps will not receive DATABASE_URL /
                    REDIS_URL until you bind a resource.
                  </p>
                ) : (
                  (service.bindings ?? []).map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div>
                        <p className="font-mono text-sm">{b.envKey}</p>
                        <p className="text-xs text-muted-foreground">
                          → {b.providerName} ({b.providerType})
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void removeBinding(b.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))
                )}
              </div>
              <div className="surface-panel grid gap-3 p-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={bindProviderId}
                    onChange={(e) => {
                      setBindProviderId(e.target.value)
                      const p = providers.find((x) => x.id === e.target.value)
                      if (p?.type === "postgres") setBindEnvKey("DATABASE_URL")
                      if (p?.type === "redis") setBindEnvKey("REDIS_URL")
                    }}
                  >
                    <option value="">Select…</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.type})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Env key</Label>
                  <Input
                    value={bindEnvKey}
                    onChange={(e) =>
                      setBindEnvKey(e.target.value.toUpperCase())
                    }
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    disabled={pending || !bindProviderId}
                    onClick={() => void createBinding()}
                  >
                    Bind
                  </Button>
                </div>
              </div>
            </div>
          </PageSection>
        ) : null}

        {tab === "database" && dbOverview ? (
          <DatabasePanel
            projectId={project.id}
            overview={dbOverview}
            onRefresh={refresh}
          />
        ) : null}

        {tab === "backups" && pitr ? (
          <BackupsPanel
            projectId={project.id}
            projectName={project.name}
            backups={backups}
            pitr={pitr}
            onRefresh={refresh}
          />
        ) : null}

        {tab === "settings" ? (
          <div className="space-y-6">
            <PageSection
              icon={SettingsIcon}
              title="Service settings"
              description="Runtime and source configuration for this service."
            >
              <div className="surface-panel space-y-3 p-4 text-sm">
                <p>
                  <span className="text-muted-foreground">Name:</span>{" "}
                  {service.name}
                </p>
                <p>
                  <span className="text-muted-foreground">Slug:</span>{" "}
                  <span className="font-mono">{service.slug}</span>
                </p>
                {isApp ? (
                  <>
                    <p>
                      <span className="text-muted-foreground">Port:</span>{" "}
                      {service.containerPort}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Root:</span>{" "}
                      {service.rootDirectory || "."}
                    </p>
                  </>
                ) : null}
              </div>
            </PageSection>
            <PageSection
              icon={Trash2Icon}
              title="Danger zone"
              description="Destroying a service removes its container and history."
            >
              <Button
                variant="destructive"
                onClick={() => setDestroyOpen(true)}
              >
                Destroy service
              </Button>
            </PageSection>
          </div>
        ) : null}
      </div>

      <ActionDialog
        open={destroyOpen}
        onOpenChange={setDestroyOpen}
        title="Destroy service"
        description={`Type ${service.name} to confirm. This cannot be undone.`}
        icon={Trash2Icon}
        footer={
          <Button
            variant="destructive"
            disabled={destroyConfirm !== service.name || pending}
            onClick={() => void destroyService()}
          >
            Destroy
          </Button>
        }
      >
        <div className="space-y-2">
          <Label>Service name</Label>
          <Input
            value={destroyConfirm}
            onChange={(e) => setDestroyConfirm(e.target.value)}
            placeholder={service.name}
          />
        </div>
      </ActionDialog>
    </AppShell>
  )
}
