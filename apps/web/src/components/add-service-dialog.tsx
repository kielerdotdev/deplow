import { useEffect, useRef, useState } from "react"
import {
  CheckIcon,
  DatabaseIcon,
  GitBranchIcon,
  GlobeIcon,
  Loader2Icon,
  RocketIcon,
  ServerIcon,
  WorkflowIcon,
} from "lucide-react"

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
import {
  SERVICE_TEMPLATES,
  type ImageServiceTemplate,
  type ServiceTemplate,
} from "@/lib/service-templates"
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

type Step = "pick" | "git" | "template"

const STAGES = [
  { key: "analyzing", label: "Analyzing" },
  { key: "building", label: "Building" },
  { key: "deploying", label: "Starting" },
  { key: "checking", label: "Checking health" },
  { key: "running", label: "Live" },
] as const

const TEMPLATE_STAGES = [
  { key: "deploying", label: "Pulling image" },
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

function templateStageIndex(status: DeployStatus | null): number {
  if (!status) return -1
  if (
    status === "queued" ||
    status === "pending" ||
    status === "analyzing" ||
    status === "building" ||
    status === "deploying"
  ) {
    return 0
  }
  if (status === "checking") return 1
  if (status === "running") return 2
  if (status === "failed") return -2
  return -1
}

function templateIcon(t: ServiceTemplate) {
  if (t.kind === "data") {
    return t.type === "postgres" ? DatabaseIcon : WorkflowIcon
  }
  if (t.id === "nginx") return GlobeIcon
  if (t.id === "httpbin") return ServerIcon
  return RocketIcon
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
  const [step, setStep] = useState<Step>("pick")
  const [template, setTemplate] = useState<ServiceTemplate | null>(null)

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
    setStep("pick")
    setTemplate(null)
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

  function pickTemplate(t: ServiceTemplate) {
    setTemplate(t)
    setName(t.name)
    setStep("template")
    setDeployError(null)
    onError(null)
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
  const canSubmitGit =
    Boolean(selection?.cloneUrl) &&
    Boolean(analysis) &&
    !analyzing &&
    !needsAppChoice &&
    !needsDockerChoice &&
    Boolean(name) &&
    !pending

  const canSubmitTemplate =
    Boolean(template) && Boolean(name.trim()) && !pending

  async function createFromTemplate(event: React.FormEvent) {
    event.preventDefault()
    if (!template) return
    const serviceName = name.trim()
    if (!serviceName) return
    setPending(true)
    onError(null)
    setDeployError(null)
    try {
      if (template.kind === "data") {
        const created = await client.services.create({
          projectId,
          name: serviceName,
          type: template.type,
        })
        setCreatedServiceId(created.id)
        setDeployStatus("running")
        await onCreated(created.id)
        setPending(false)
        return
      }

      const img = template as ImageServiceTemplate
      const created = await client.services.create({
        projectId,
        name: serviceName,
        type: img.type,
        containerPort: img.containerPort,
      })
      setCreatedServiceId(created.id)
      const deployment = await client.deployments.create({
        serviceId: created.id,
        image: img.image,
        options: {
          image: img.image,
          containerPort: img.containerPort,
          serviceName,
        },
      })
      setDeployId(deployment.id)
      setDeployStatus(deployment.status as DeployStatus)
      await onCreated(created.id)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      onError(message)
      setDeployError(message)
      setPending(false)
    }
  }

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
      setCreatedServiceId(result.service.id)
      if (result.deployment) {
        setDeployId(result.deployment.id)
        setDeployStatus(result.deployment.status as DeployStatus)
      } else {
        // Git connect without image: service + webhook only (not deployed).
        setDeployId(null)
        setDeployStatus(null)
        setPending(false)
      }
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

  const deploying = Boolean(pending || deployId)
  const imageTemplates = SERVICE_TEMPLATES.filter((t) => t.kind === "image")
  const dataTemplates = SERVICE_TEMPLATES.filter((t) => t.kind === "data")

  const description =
    step === "pick"
      ? "Start from a hello-world image, a database, or connect a Git repo."
      : deploying
        ? "Deployment in progress."
        : step === "template"
          ? template?.kind === "data"
            ? "Creates and provisions a dedicated data service."
            : `Deploys ${template && template.kind === "image" ? template.image : "the image"} on your agent node.`
          : "Pick a repository — we detect Dockerfile or Railpack, then create and deploy."

  return (
    <ActionDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Add service"
      description={description}
      icon={RocketIcon}
      size="xl"
      footer={
        deployStatus === "running" ||
        (createdServiceId && !deployId && !pending) ? (
          <Button type="button" onClick={() => handleOpenChange(false)}>
            Done
          </Button>
        ) : step === "pick" ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
        ) : deploying ? (
          <Button type="button" disabled>
            <Loader2Icon
              className="size-4 animate-spin"
              data-icon="inline-start"
            />
            {template?.kind === "data" ? "Provisioning…" : "Deploying…"}
          </Button>
        ) : step === "template" ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setStep("pick")
                setTemplate(null)
                setDeployError(null)
              }}
            >
              Back
            </Button>
            <Button
              type="submit"
              form="add-service-template"
              disabled={!canSubmitTemplate}
            >
              {template?.kind === "data" ? "Create" : "Create and deploy"}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setStep("pick")
                setSelection(null)
                setAnalysis(null)
              }}
            >
              Back
            </Button>
            <Button type="submit" form="add-service" disabled={!canSubmitGit}>
              Create and deploy
            </Button>
          </>
        )
      }
    >
      {deploying && step !== "pick" ? (
        <DeployProgress
          stages={step === "template" ? TEMPLATE_STAGES : STAGES}
          activeStage={
            step === "template"
              ? templateStageIndex(deployStatus)
              : stageIndex(deployStatus)
          }
          deployStatus={deployStatus}
          deployError={deployError}
          subtitle={
            step === "git" && selection
              ? `${selection.fullName} @${selection.branch}`
              : template
                ? template.title
                : null
          }
          webhookNotice={webhookNotice}
        />
      ) : step === "pick" ? (
        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Hello world
            </h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {imageTemplates.map((t) => {
                const Icon = templateIcon(t)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickTemplate(t)}
                    className="flex flex-col items-start gap-2 rounded-xl border border-border bg-muted/15 p-3 text-left transition-[background-color,border-color,transform] duration-150 ease-out-ui hover:border-foreground/25 hover:bg-muted/40 active:scale-[0.98]"
                  >
                    <span className="flex size-8 items-center justify-center rounded-lg border bg-background">
                      <Icon className="size-4" />
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {t.title}
                    </span>
                    <span className="text-xs text-pretty text-muted-foreground">
                      {t.description}
                    </span>
                    {t.kind === "image" ? (
                      <span className="font-mono text-[10px] text-muted-foreground/80">
                        {t.image}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Data
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {dataTemplates.map((t) => {
                const Icon = templateIcon(t)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickTemplate(t)}
                    className="flex items-start gap-3 rounded-xl border border-border bg-muted/15 p-3 text-left transition-[background-color,border-color,transform] duration-150 ease-out-ui hover:border-foreground/25 hover:bg-muted/40 active:scale-[0.98]"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background">
                      <Icon className="size-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-foreground">
                        {t.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-pretty text-muted-foreground">
                        {t.description}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              From source
            </h3>
            <button
              type="button"
              onClick={() => setStep("git")}
              className="flex w-full items-start gap-3 rounded-xl border border-border bg-muted/15 p-3 text-left transition-[background-color,border-color,transform] duration-150 ease-out-ui hover:border-foreground/25 hover:bg-muted/40 active:scale-[0.98]"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background">
                <GitBranchIcon className="size-4" />
              </span>
              <span>
                <span className="block text-sm font-medium text-foreground">
                  Git repository
                </span>
                <span className="mt-0.5 block text-xs text-pretty text-muted-foreground">
                  Analyze a repo, then build with Railpack or Dockerfile.
                </span>
              </span>
            </button>
          </section>
        </div>
      ) : step === "template" && template ? (
        <form
          id="add-service-template"
          className="space-y-3"
          onSubmit={(e) => void createFromTemplate(e)}
        >
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm">
            <p className="text-xs font-medium text-muted-foreground">
              Template
            </p>
            <p className="mt-0.5 font-medium">{template.title}</p>
            {template.kind === "image" ? (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {template.image} · port {template.containerPort}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Provisioned on the project&apos;s agent node
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="template-service-name">Name</Label>
            <Input
              id="template-service-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={template.name}
              autoFocus
            />
          </div>
          {deployError ? (
            <Alert variant="destructive">
              <AlertDescription>{deployError}</AlertDescription>
            </Alert>
          ) : null}
        </form>
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

function DeployProgress({
  stages,
  activeStage,
  deployStatus,
  deployError,
  subtitle,
  webhookNotice,
}: {
  stages: ReadonlyArray<{ key: string; label: string }>
  activeStage: number
  deployStatus: DeployStatus | null
  deployError: string | null
  subtitle: string | null
  webhookNotice: {
    warning: string | null
    secret: string | null
    url: string | null
  } | null
}) {
  return (
    <div className="space-y-3">
      {subtitle ? (
        <p className="truncate text-sm font-medium text-foreground">
          {subtitle}
        </p>
      ) : null}
      <ol className="flex flex-col gap-1.5">
        {stages.map((stage, i) => {
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
  )
}
