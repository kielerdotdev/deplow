import { useEffect, useRef, useState } from "react"
import { CheckIcon, Loader2Icon, RocketIcon } from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import {
  RepoSelector,
  type RepoSelectorValue,
} from "@/components/repo-selector"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { client } from "@/lib/orpc"
import { cn } from "@/lib/utils"

type Analysis = Awaited<ReturnType<typeof client.services.analyzeSource>>

type DeployStatus =
  | "queued"
  | "analyzing"
  | "building"
  | "deploying"
  | "checking"
  | "running"
  | "failed"
  | "stopped"
  | "pending"

const STAGES = [
  { key: "analyzing", label: "Analyzing" },
  { key: "building", label: "Building" },
  { key: "deploying", label: "Starting" },
  { key: "checking", label: "Checking health" },
  { key: "running", label: "Live" },
] as const

function stageIndex(status: DeployStatus | null): number {
  if (!status) return -1
  if (status === "queued" || status === "pending") return 0
  if (status === "analyzing") return 0
  if (status === "building") return 1
  if (status === "deploying") return 2
  if (status === "checking") return 3
  if (status === "running") return 4
  if (status === "failed") return -2
  return -1
}

type AddServiceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  onCreated: (serviceId?: string) => Promise<void>
  onError: (message: string | null) => void
}

export function AddServiceDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
  onError,
}: AddServiceDialogProps) {
  const [selection, setSelection] = useState<RepoSelectorValue | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [type, setType] = useState<"web" | "worker">("web")
  const [rootDirectory, setRootDirectory] = useState(".")
  const [dockerfilePath, setDockerfilePath] = useState<string | null>(null)
  const [strategyOverride, setStrategyOverride] = useState<
    "auto" | "railpack" | "dockerfile"
  >("auto")
  const [buildCommand, setBuildCommand] = useState("")
  const [startCommand, setStartCommand] = useState("")
  const [portOverride, setPortOverride] = useState("")
  const [healthCheckPath, setHealthCheckPath] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [pending, setPending] = useState(false)
  const [deployId, setDeployId] = useState<string | null>(null)
  const [createdServiceId, setCreatedServiceId] = useState<string | null>(null)
  const [deployStatus, setDeployStatus] = useState<DeployStatus | null>(null)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [webhookNotice, setWebhookNotice] = useState<{
    warning: string | null
    secret: string | null
    url: string | null
  } | null>(null)

  const analyzeSeq = useRef(0)

  function resetForm() {
    setSelection(null)
    setAnalysis(null)
    setAnalyzing(false)
    setAnalyzeError(null)
    setName("")
    setType("web")
    setRootDirectory(".")
    setDockerfilePath(null)
    setStrategyOverride("auto")
    setBuildCommand("")
    setStartCommand("")
    setPortOverride("")
    setHealthCheckPath("")
    setShowAdvanced(false)
    setPending(false)
    setDeployId(null)
    setCreatedServiceId(null)
    setDeployStatus(null)
    setDeployError(null)
    setWebhookNotice(null)
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) resetForm()
  }

  async function runAnalysis(
    value: RepoSelectorValue,
    overrides?: {
      rootDirectory?: string
      dockerfilePath?: string | null
      strategyOverride?: "auto" | "railpack" | "dockerfile"
    },
  ) {
    const seq = ++analyzeSeq.current
    setAnalyzing(true)
    setAnalyzeError(null)
    setAnalysis(null)
    try {
      const result = await client.services.analyzeSource({
        provider: value.provider,
        repoUrl: value.cloneUrl,
        branch: value.branch,
        repoFullName: value.fullName,
        rootDirectory: overrides?.rootDirectory,
        dockerfilePath: overrides?.dockerfilePath,
        strategyOverride: overrides?.strategyOverride,
        authMethod: value.authMethod,
        installationId: value.installationId,
        accessToken: value.accessToken,
      })
      if (seq !== analyzeSeq.current) return
      setAnalysis(result)
      setName(result.suggestedName)
      setType(result.suggestedType)
      setRootDirectory(result.applicationRoot)
      setDockerfilePath(result.dockerfilePath)
      setBuildCommand(result.buildCommand ?? "")
      setStartCommand(result.startCommand ?? "")
      if (result.errors.length) {
        setAnalyzeError(result.errors[0] ?? null)
      }
    } catch (cause) {
      if (seq !== analyzeSeq.current) return
      setAnalyzeError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (seq === analyzeSeq.current) setAnalyzing(false)
    }
  }

  function handleSelection(value: RepoSelectorValue | null) {
    setSelection(value)
    setAnalysis(null)
    setAnalyzeError(null)
    setDeployId(null)
    setCreatedServiceId(null)
    setDeployStatus(null)
    setDeployError(null)
    if (value?.cloneUrl) {
      void runAnalysis(value)
    }
  }

  useEffect(() => {
    if (!deployId) return
    let cancelled = false
    const tick = async () => {
      try {
        const d = await client.deployments.get({ id: deployId })
        if (cancelled) return
        setDeployStatus(d.status as DeployStatus)
        if (d.status === "running") {
          await onCreated(createdServiceId ?? undefined)
          return
        }
        if (d.status === "failed") {
          setDeployError(d.errorMessage ?? "Deployment failed")
          setPending(false)
          // Service still exists — parent already refreshed
          await onCreated(createdServiceId ?? undefined)
          return
        }
        window.setTimeout(() => void tick(), 1500)
      } catch (cause) {
        if (cancelled) return
        setDeployError(cause instanceof Error ? cause.message : String(cause))
        setPending(false)
      }
    }
    void tick()
    return () => {
      cancelled = true
    }
  }, [deployId, onCreated, createdServiceId])

  const needsAppChoice = analysis?.needsChoice === "application"
  const needsDockerChoice = analysis?.needsChoice === "dockerfile"
  const canSubmit =
    Boolean(selection?.cloneUrl) &&
    Boolean(analysis) &&
    !analyzing &&
    !needsAppChoice &&
    !needsDockerChoice &&
    Boolean(name) &&
    !pending

  async function createAndDeploy(event: React.FormEvent) {
    event.preventDefault()
    if (!selection || !analysis) return
    setPending(true)
    onError(null)
    setDeployError(null)
    try {
      const result = await client.services.createAndDeploy({
        projectId,
        name,
        type,
        containerPort: portOverride ? Number(portOverride) : undefined,
        analysisId: analysis.analysisId,
        fingerprint: analysis.fingerprint,
        provider: selection.provider,
        repoUrl: selection.cloneUrl,
        branch: selection.branch,
        repoFullName: selection.fullName,
        authMethod: selection.authMethod,
        installationId: selection.installationId,
        accessToken: selection.accessToken,
        rootDirectory,
        buildStrategyOverride: strategyOverride,
        dockerfilePath,
        buildCommand: buildCommand.trim() || null,
        startCommand: startCommand.trim() || null,
        healthCheckPath: healthCheckPath.trim() || null,
      })
      setDeployId(result.deployment.id)
      setCreatedServiceId(result.service.id)
      setDeployStatus(result.deployment.status as DeployStatus)
      if (result.webhookWarning || result.webhookSecret) {
        setWebhookNotice({
          warning: result.webhookWarning ?? null,
          secret: result.webhookSecret ?? null,
          url: result.webhookUrl ?? null,
        })
      }
      await onCreated(result.service.id)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      onError(message)
      setDeployError(message)
      setPending(false)
    }
  }

  const activeStage = stageIndex(deployStatus)
  const deploying = Boolean(pending || deployId)

  return (
    <ActionDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Add service"
      description={
        deploying
          ? "Deployment in progress."
          : "Pick a repository — we detect Dockerfile or Railpack, then create and deploy."
      }
      icon={RocketIcon}
      size="xl"
      footer={
        deployStatus === "running" ? (
          <Button type="button" onClick={() => handleOpenChange(false)}>
            Done
          </Button>
        ) : deploying ? (
          <Button type="button" disabled>
            <Loader2Icon
              className="size-4 animate-spin"
              data-icon="inline-start"
            />
            Deploying…
          </Button>
        ) : (
          <Button type="submit" form="add-service" disabled={!canSubmit}>
            Create and deploy
          </Button>
        )
      }
    >
      {deploying ? (
        <div className="space-y-3">
          {selection ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="truncate font-medium text-foreground">
                {selection.fullName}
              </span>
              <span className="text-xs">@{selection.branch}</span>
            </p>
          ) : null}
          <ol className="flex flex-col gap-1.5">
            {STAGES.map((stage, i) => {
              const done = activeStage > i || deployStatus === "running"
              const current = activeStage === i && deployStatus !== "running"
              return (
                <li
                  key={stage.key}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                    done && "border-primary/40 bg-primary/10 text-foreground",
                    current && "border-foreground/30 bg-muted",
                    !done && !current && "text-muted-foreground",
                  )}
                >
                  {done ? (
                    <CheckIcon className="size-3.5 shrink-0" />
                  ) : current ? (
                    <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
                  ) : (
                    <span className="size-3.5 shrink-0 rounded-full border border-muted-foreground/40" />
                  )}
                  {stage.label}
                </li>
              )
            })}
          </ol>
          {deployError ? (
            <Alert variant="destructive">
              <AlertDescription>{deployError}</AlertDescription>
            </Alert>
          ) : null}
          {webhookNotice?.warning || webhookNotice?.secret ? (
            <Alert>
              <AlertDescription className="space-y-2 text-xs">
                {webhookNotice.warning ? <p>{webhookNotice.warning}</p> : null}
                {webhookNotice.url ? (
                  <p className="font-mono break-all">{webhookNotice.url}</p>
                ) : null}
                {webhookNotice.secret ? (
                  <p>
                    Secret (copy once):{" "}
                    <span className="font-mono break-all">
                      {webhookNotice.secret}
                    </span>
                  </p>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      ) : (
        <form
          id="add-service"
          className="space-y-3"
          onSubmit={(e) => void createAndDeploy(e)}
        >
          <div className="space-y-1.5">
            <Label>Repository</Label>
            <RepoSelector onChange={handleSelection} />
          </div>

          {analyzing ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Analyzing repository…
            </div>
          ) : null}

          {analyzeError && !needsAppChoice && !needsDockerChoice ? (
            <Alert variant="destructive">
              <AlertDescription>{analyzeError}</AlertDescription>
            </Alert>
          ) : null}

          {needsAppChoice && analysis ? (
            <div className="space-y-1.5">
              <Label>Application</Label>
              <p className="text-xs text-muted-foreground">
                Multiple applications found—select one.
              </p>
              <div className="flex flex-wrap gap-2">
                {analysis.applications.map((app) => (
                  <Button
                    key={app}
                    type="button"
                    size="sm"
                    variant={rootDirectory === app ? "default" : "outline"}
                    onClick={() => {
                      setRootDirectory(app)
                      if (selection) {
                        void runAnalysis(selection, {
                          rootDirectory: app,
                          strategyOverride,
                        })
                      }
                    }}
                  >
                    {app === "." ? "/" : app}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {needsDockerChoice && analysis ? (
            <div className="space-y-1.5">
              <Label>Dockerfile</Label>
              <p className="text-xs text-muted-foreground">
                Multiple Dockerfiles found—select one.
              </p>
              <div className="flex flex-wrap gap-2">
                {analysis.dockerfiles.map((df) => (
                  <Button
                    key={df}
                    type="button"
                    size="sm"
                    variant={dockerfilePath === df ? "default" : "outline"}
                    onClick={() => {
                      setDockerfilePath(df)
                      if (selection) {
                        void runAnalysis(selection, {
                          rootDirectory,
                          dockerfilePath: df,
                          strategyOverride: "dockerfile",
                        })
                      }
                    }}
                  >
                    {df}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {analysis && !needsAppChoice && !needsDockerChoice ? (
            <>
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Detection
                </p>
                <dl className="grid gap-1 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Application root
                    </dt>
                    <dd className="font-medium">
                      {analysis.applicationRoot === "."
                        ? "/"
                        : analysis.applicationRoot}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Builder</dt>
                    <dd className="font-medium capitalize">
                      {analysis.strategy ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Runtime / framework
                    </dt>
                    <dd className="font-medium">
                      {[analysis.runtime, analysis.framework]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </dd>
                  </div>
                  {analysis.dockerfilePath ? (
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Dockerfile
                      </dt>
                      <dd className="font-mono text-xs font-medium">
                        {analysis.dockerfilePath}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-xs text-muted-foreground">Type</dt>
                    <dd className="font-medium capitalize">
                      {analysis.suggestedType}
                      {analysis.typeConfidence === "low" ? " (confirm)" : ""}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="service-name">Name</Label>
                  <Input
                    id="service-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="api"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={type === "web" ? "default" : "outline"}
                      onClick={() => setType("web")}
                    >
                      Web
                    </Button>
                    <Button
                      type="button"
                      variant={type === "worker" ? "default" : "outline"}
                      onClick={() => setType("worker")}
                    >
                      Worker
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setShowAdvanced((v) => !v)}
                  aria-expanded={showAdvanced}
                >
                  {showAdvanced ? "Hide advanced" : "Advanced settings"}
                </button>
                {showAdvanced ? (
                  <div className="space-y-2.5 rounded-lg border bg-muted/20 p-3">
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="root-dir">Root directory</Label>
                        <Input
                          id="root-dir"
                          value={rootDirectory}
                          onChange={(e) => setRootDirectory(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="df-path">Dockerfile path</Label>
                        <Input
                          id="df-path"
                          value={dockerfilePath ?? ""}
                          onChange={(e) =>
                            setDockerfilePath(e.target.value || null)
                          }
                          placeholder="Dockerfile"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Build strategy</Label>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            ["auto", "Railpack"],
                            ["dockerfile", "Dockerfile"],
                          ] as const
                        ).map(([value, label]) => (
                          <Button
                            key={value}
                            type="button"
                            size="sm"
                            variant={
                              strategyOverride === value ? "default" : "outline"
                            }
                            onClick={() => {
                              setStrategyOverride(value)
                              if (selection) {
                                void runAnalysis(selection, {
                                  rootDirectory,
                                  dockerfilePath,
                                  strategyOverride: value,
                                })
                              }
                            }}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Railpack is the default. Use Dockerfile only when you
                        want to build the repo&apos;s Dockerfile as-is.
                      </p>
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="build-cmd">Build command</Label>
                        <Input
                          id="build-cmd"
                          value={buildCommand}
                          onChange={(e) => setBuildCommand(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="start-cmd">Start command</Label>
                        <Input
                          id="start-cmd"
                          value={startCommand}
                          onChange={(e) => setStartCommand(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="port-override">Port override</Label>
                        <Input
                          id="port-override"
                          type="number"
                          value={portOverride}
                          onChange={(e) => setPortOverride(e.target.value)}
                          placeholder="Platform default (80)"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="health-path">Health-check path</Label>
                        <Input
                          id="health-path"
                          value={healthCheckPath}
                          onChange={(e) => setHealthCheckPath(e.target.value)}
                          placeholder="/health"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </form>
      )}
    </ActionDialog>
  )
}
