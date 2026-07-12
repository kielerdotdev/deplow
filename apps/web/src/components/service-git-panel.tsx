import { useState } from "react"
import {
  ExternalLinkIcon,
  GitBranchIcon,
  Link2Icon,
  ZapIcon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { client } from "@/lib/orpc"
import { formatDateTime } from "@/lib/ui-format"

type ServiceGit = {
  connected: boolean
  provider?: "github" | "gitlab" | string | null
  repoUrl?: string | null
  repoFullName?: string | null
  branch?: string | null
  webhookUrl?: string | null
  webhookManaged?: boolean
  lastDeliveryAt?: string | null
  lastDeliveryStatus?: string | null
  lastDeliveryError?: string | null
  watchPaths?: string[] | null
}

export function ServiceGitPanel({
  serviceId,
  git,
  onChanged,
  initialWebhookSecret,
  initialWebhookWarning,
}: {
  serviceId: string
  git: ServiceGit
  onChanged: () => Promise<void> | void
  initialWebhookSecret?: string | null
  initialWebhookWarning?: string | null
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showWebhook, setShowWebhook] = useState(
    Boolean(initialWebhookSecret || initialWebhookWarning),
  )
  const [webhookSecret] = useState(initialWebhookSecret ?? null)
  const [warning] = useState(initialWebhookWarning ?? null)
  const [copied, setCopied] = useState(false)
  const [watchPathsText, setWatchPathsText] = useState(
    (git.watchPaths ?? []).join("\n"),
  )
  const [watchSaved, setWatchSaved] = useState(false)

  if (!git.connected) {
    return (
      <div className="surface-panel px-5 py-4 text-sm text-muted-foreground">
        No Git repository connected. Add a service from Git or connect a repo to
        enable push-to-deploy.
      </div>
    )
  }

  const short = git.repoFullName || git.repoUrl || "repository"

  async function disconnect() {
    setPending(true)
    setError(null)
    try {
      await client.services.disconnectGit({ serviceId })
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function copyWebhook() {
    if (!git.webhookUrl) return
    await navigator.clipboard.writeText(git.webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function saveWatchPaths() {
    setPending(true)
    setError(null)
    setWatchSaved(false)
    try {
      const paths = watchPathsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
      await client.services.update({
        id: serviceId,
        gitWatchPaths: paths.length > 0 ? paths : null,
      })
      setWatchSaved(true)
      await onChanged()
      setTimeout(() => setWatchSaved(false), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="surface-panel overflow-hidden">
      <div className="border-b border-border/60 px-5 py-4">
        <h2 className="text-sm font-semibold tracking-tight">Git & push deploy</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Pushes to the production branch deploy this service.
        </p>
      </div>
      <div className="space-y-4 px-5 py-4 text-sm">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Git action failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {warning ? (
          <Alert>
            <AlertTitle>Manual webhook setup</AlertTitle>
            <AlertDescription className="text-xs">{warning}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {git.provider === "gitlab" ? (
              <Link2Icon className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <GitBranchIcon className="size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <div className="truncate font-medium">{short}</div>
              <div className="text-xs text-muted-foreground">
                {git.provider ?? "git"} · branch{" "}
                <code className="font-mono">{git.branch ?? "main"}</code>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {git.repoUrl ? (
              <a
                href={git.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-[0.8rem] hover:bg-muted"
              >
                <ExternalLinkIcon className="size-3.5" />
                Repo
              </a>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => void disconnect()}
            >
              Disconnect
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-border/60 px-3 py-2">
          <ZapIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="font-medium">
              {git.webhookManaged
                ? "Webhook registered"
                : "Webhook URL ready"}
            </div>
            <div className="text-xs text-muted-foreground">
              {git.lastDeliveryStatus
                ? `Last delivery: ${git.lastDeliveryStatus}${
                    git.lastDeliveryAt
                      ? ` · ${formatDateTime(git.lastDeliveryAt)}`
                      : ""
                  }`
                : git.webhookManaged
                  ? "Push to the production branch to deploy."
                  : "Add this URL as a push webhook if auto-register did not run."}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground">
            Watch paths (optional)
          </label>
          <p className="text-xs text-muted-foreground">
            One micromatch glob per line. Empty = deploy on any change to the
            production branch.
          </p>
          <textarea
            className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
            value={watchPathsText}
            onChange={(e) => setWatchPathsText(e.target.value)}
            placeholder={"apps/web/**\npackages/shared/**"}
            spellCheck={false}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => void saveWatchPaths()}
          >
            {watchSaved ? "Saved" : "Save watch paths"}
          </Button>
        </div>

        {git.lastDeliveryError ? (
          <Alert variant="destructive">
            <AlertTitle>Last webhook failed</AlertTitle>
            <AlertDescription className="text-xs whitespace-pre-wrap">
              {git.lastDeliveryError}
            </AlertDescription>
          </Alert>
        ) : null}

        {webhookSecret ? (
          <Alert>
            <AlertTitle>Webhook secret — copy once</AlertTitle>
            <AlertDescription className="font-mono text-xs break-all">
              {webhookSecret}
            </AlertDescription>
          </Alert>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowWebhook((v) => !v)}
        >
          {showWebhook ? "Hide webhook URL" : "Show webhook URL"}
        </Button>
        {showWebhook && git.webhookUrl ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="max-w-full flex-1 truncate rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-xs">
              {git.webhookUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyWebhook()}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
