import {
  DownloadIcon,
  GitBranchIcon,
  RocketIcon,
  RotateCcwIcon,
  ScrollTextIcon,
} from "lucide-react"

import type { DeployRow } from "@/components/project-deployments-panel"
import { EmptyState } from "@/components/empty-state"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDateTime, summarizeDeployError } from "@/lib/ui-format"

export function AppSheetBody({
  gitConnected,
  repoLabel,
  gitBranch,
  mode,
  setMode,
  showAdvanced,
  setShowAdvanced,
  sourcePath,
  setSourcePath,
  image,
  setImage,
  containerPort,
  setContainerPort,
  publishPort,
  setPublishPort,
  pending,
  canDeploy,
  latest,
  selected,
  deployments,
  onDeploy,
  onRetry,
  onRollback,
  onFetchLogs,
  onSelectDeploy,
  onConnectGit,
  onViewDeployments,
}: {
  gitConnected: boolean
  repoLabel: string | null
  gitBranch: string
  mode: "git" | "source" | "image"
  setMode: (m: "git" | "source" | "image") => void
  showAdvanced: boolean
  setShowAdvanced: (fn: (v: boolean) => boolean) => void
  sourcePath: string
  setSourcePath: (v: string) => void
  image: string
  setImage: (v: string) => void
  containerPort: number
  setContainerPort: (v: number) => void
  publishPort: number | ""
  setPublishPort: (v: number | "") => void
  pending: boolean
  canDeploy: boolean
  latest: DeployRow | undefined
  selected: DeployRow | null
  deployments: DeployRow[]
  onDeploy: (force?: "git" | "source" | "image") => void
  onRetry: (id: string) => void
  onRollback: () => void
  onFetchLogs: (d: DeployRow) => void
  onSelectDeploy: (id: string) => void
  onConnectGit: () => void
  onViewDeployments: () => void
}) {
  const isNew = deployments.length === 0

  if (!gitConnected && isNew && !showAdvanced) {
    return (
      <div className="flex flex-col gap-6">
        <EmptyState
          size="sm"
          icon={GitBranchIcon}
          title="Connect a repository to deploy"
          description="Link GitHub or GitLab. Then Deploy clones the branch, builds with Railpack or your Dockerfile, and shows status here."
          action={
            <Button className="w-full" onClick={onConnectGit}>
              <GitBranchIcon data-icon="inline-start" />
              Connect repository
            </Button>
          }
          secondaryAction={
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setMode("source")
                setShowAdvanced(() => true)
              }}
            >
              Use a local path instead
            </Button>
          }
        />
        <ol className="space-y-2 rounded-lg border border-border/80 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">1. Settings</span> —
            connect the repo under Source
          </li>
          <li>
            <span className="font-medium text-foreground">2. Deploy</span> — one
            click from this panel or the header
          </li>
          <li>
            <span className="font-medium text-foreground">3. Status</span> —
            live on the App card; full list under Deployments
          </li>
        </ol>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {gitConnected && repoLabel ? (
          <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <GitBranchIcon className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{repoLabel}</span>
              <span className="text-xs text-muted-foreground">
                · {gitBranch}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isNew
                ? "Hit Deploy to clone this branch and go live."
                : "Redeploy from this branch anytime."}
            </p>
          </div>
        ) : null}

        {latest ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border/80 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Latest deployment
              </p>
              <StatusBadge status={latest.status} />
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {latest.id.slice(0, 8)}
              {latest.buildStrategy ? ` · ${latest.buildStrategy}` : ""}
              {" · "}
              {formatDateTime(latest.createdAt)}
            </p>
            {latest.status === "failed" && latest.errorMessage ? (
              <p className="text-xs text-destructive">
                {summarizeDeployError(latest.errorMessage)}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => onFetchLogs(latest)}
              >
                <ScrollTextIcon data-icon="inline-start" />
                Logs
              </Button>
              <Button variant="ghost" size="sm" onClick={onViewDeployments}>
                All deployments
              </Button>
            </div>
          </div>
        ) : gitConnected ? (
          <p className="text-xs text-muted-foreground">
            No deployments yet — status will show here after the first deploy.
            Full history lives under{" "}
            <button
              type="button"
              className="font-medium text-foreground underline-offset-2 hover:underline"
              onClick={onViewDeployments}
            >
              Deployments
            </button>{" "}
            in the left rail.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending || !canDeploy}
            onClick={() =>
              onDeploy(
                gitConnected && (mode === "git" || !showAdvanced)
                  ? "git"
                  : mode,
              )
            }
          >
            <RocketIcon data-icon="inline-start" />
            {pending ? "Deploying…" : isNew ? "Deploy now" : "Redeploy"}
          </Button>
          {latest?.status === "failed" ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => onRetry(latest.id)}
            >
              <RotateCcwIcon data-icon="inline-start" />
              Retry
            </Button>
          ) : null}
          {deployments.filter((d) => d.image).length >= 2 ? (
            <Button variant="outline" disabled={pending} onClick={onRollback}>
              <RotateCcwIcon data-icon="inline-start" />
              Roll back
            </Button>
          ) : null}
        </div>

        <button
          type="button"
          className="text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Hide advanced" : "Advanced: local path or image"}
        </button>

        {showAdvanced ? (
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            {!gitConnected ? (
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                onClick={onConnectGit}
              >
                <GitBranchIcon data-icon="inline-start" />
                Prefer Git instead
              </Button>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {gitConnected ? (
                <Button
                  size="sm"
                  variant={mode === "git" ? "default" : "outline"}
                  onClick={() => setMode("git")}
                >
                  Git
                </Button>
              ) : null}
              <Button
                size="sm"
                variant={mode === "source" ? "default" : "outline"}
                onClick={() => setMode("source")}
              >
                Source path
              </Button>
              <Button
                size="sm"
                variant={mode === "image" ? "default" : "outline"}
                onClick={() => setMode("image")}
              >
                Image
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
                  Must be your app directory — not{" "}
                  <code className="text-xs">/</code>.
                </p>
              </div>
            ) : null}
            {mode === "image" ? (
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
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
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
                <Label htmlFor="host-port">Host port (optional)</Label>
                <Input
                  id="host-port"
                  type="number"
                  value={publishPort}
                  onChange={(e) =>
                    setPublishPort(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  placeholder="proxy-only"
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {selected && selected.id !== latest?.id ? (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">
                Selected {selected.id.slice(0, 8)}
              </p>
            </div>
            <StatusBadge status={selected.status} />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => onFetchLogs(selected)}
          >
            <ScrollTextIcon data-icon="inline-start" />
            View logs
          </Button>
        </div>
      ) : null}

      {deployments.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Recent</h3>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              onClick={onViewDeployments}
            >
              View all
            </button>
          </div>
          {deployments.slice(0, 5).map((d) => (
            <button
              key={d.id}
              type="button"
              className="flex items-center justify-between gap-2 rounded-lg border border-border/80 px-3 py-2 text-left hover:bg-muted/40"
              onClick={() => onSelectDeploy(d.id)}
            >
              <StatusBadge status={d.status} />
              <span className="text-xs text-muted-foreground">
                {formatDateTime(d.createdAt)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  )
}

export function InfraSheetBody({
  name,
  ready,
  onOpenSecrets,
}: {
  name: string
  ready: boolean
  onOpenSecrets: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <StatusBadge status={ready ? "ready" : "pending"} />
        <span className="text-sm capitalize">{name}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        {ready
          ? "Provisioned with this project. Connection material lives in secrets.yaml — containers get Docker-network URLs injected on deploy."
          : "Still provisioning. Refresh in a moment."}
      </p>
      <Button variant="outline" size="sm" onClick={onOpenSecrets}>
        <DownloadIcon data-icon="inline-start" />
        Open secrets
      </Button>
    </div>
  )
}
