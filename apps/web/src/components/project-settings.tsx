import { useState } from "react"
import { Link } from "@tanstack/react-router"
import {
  CheckCircle2Icon,
  Code2Icon,
  CopyIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  GlobeIcon,
  Link2Icon,
  NetworkIcon,
  RocketIcon,
  ZapIcon,
} from "lucide-react"

import {
  RepoSelector,
  type RepoSelectorValue,
} from "@/components/repo-selector"
import {
  ConnectionChip,
  SettingsField,
  SettingsGroupLabel,
  SettingsHint,
  SettingsSection,
  SettingsStatusRow,
} from "@/components/settings-section"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  formatDateTime,
  repoShortName,
  summarizeDeployError,
} from "@/lib/ui-format"

type ProjectGit = {
  connected?: boolean
  provider?: string | null
  branch?: string | null
  repoUrl?: string | null
  webhookUrl?: string | null
  webhookManaged?: boolean
  lastDeliveryStatus?: string | null
  lastDeliveryAt?: string | null
  lastDeliveryError?: string | null
} | null

export type ProjectSettingsProps = {
  projectName: string
  projectSlug: string
  publicUrl?: string | null
  git?: ProjectGit
  pending: boolean
  gitProvider: "github" | "gitlab"
  setGitProvider: (v: "github" | "gitlab") => void
  gitRepoUrl: string
  setGitRepoUrl: (v: string) => void
  gitBranch: string
  setGitBranch: (v: string) => void
  webhookSecretShown: string | null
  copied: "url" | "secrets" | "webhook" | null
  onCopyUrl: (url: string) => void
  onCopyWebhook: (url: string) => void
  /** Prefer selection payload so connect never races empty parent state */
  onConnect: (selection?: {
    provider: "github" | "gitlab"
    repoUrl: string
    branch: string
    fullName?: string
    authMethod?: "github_app" | "oauth" | "pat" | "platform"
    installationId?: string
    accessToken?: string
  }) => void
  onDisconnect: () => void
  onDeploy: () => void
}

/**
 * Railway-inspired project Settings: Source + Networking.
 * Platform owns the glue; UI only shows living connection status.
 */
export function ProjectSettings(props: ProjectSettingsProps) {
  const short = repoShortName(props.git?.repoUrl)
  const connected = Boolean(props.git?.connected && short)
  const [filter, setFilter] = useState("")
  const [showWebhook, setShowWebhook] = useState(false)

  const q = filter.trim().toLowerCase()
  const showSource =
    !q ||
    "source repo git branch deploy webhook github gitlab".includes(q) ||
    (short?.toLowerCase().includes(q) ?? false)
  const showNetworking =
    !q ||
    "network domain url public private dns proxy".includes(q) ||
    (props.publicUrl?.toLowerCase().includes(q) ?? false) ||
    props.projectSlug.toLowerCase().includes(q)

  return (
    <div className="flex flex-col gap-2">
      <div className="mb-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter settings…"
          className="bg-muted/30"
          aria-label="Filter settings"
        />
      </div>

      {showSource ? (
        <SettingsSection icon={Code2Icon} title="Source">
          {connected && short ? (
            <ConnectedSource
              {...props}
              short={short}
              showWebhook={showWebhook}
              setShowWebhook={setShowWebhook}
            />
          ) : (
            <ConnectSourceForm {...props} />
          )}
        </SettingsSection>
      ) : null}

      {showNetworking ? (
        <SettingsSection icon={NetworkIcon} title="Networking">
          <NetworkingBlock {...props} />
        </SettingsSection>
      ) : null}

      {!showSource && !showNetworking ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No settings match “{filter}”.
        </p>
      ) : null}
    </div>
  )
}

function ConnectedSource({
  git,
  short,
  pending,
  webhookSecretShown,
  showWebhook,
  setShowWebhook,
  copied,
  onCopyWebhook,
  onDisconnect,
  onDeploy,
}: ProjectSettingsProps & {
  short: string
  showWebhook: boolean
  setShowWebhook: (v: boolean) => void
}) {
  return (
    <div className="space-y-5">
      <SettingsField label="Source Repo">
        <ConnectionChip
          icon={git?.provider === "gitlab" ? Link2Icon : GitBranchIcon}
          label={short}
          sublabel={git?.provider ?? "git"}
          actions={
            <>
              {git?.repoUrl ? (
                <a
                  href={git.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open repository"
                  className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={onDisconnect}
              >
                Disconnect
              </Button>
            </>
          }
        />
      </SettingsField>

      <SettingsField
        label="Branch connected to production"
        description="Pushes to this branch deploy the production slot. No preview deploys in v1."
      >
        <ConnectionChip
          icon={GitBranchIcon}
          label={git?.branch ?? "main"}
          actions={
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={onDisconnect}
            >
              Disconnect
            </Button>
          }
        />
      </SettingsField>

      <SettingsStatusRow
        icon={ZapIcon}
        title="Auto deploys when pushed"
        description={
          git?.lastDeliveryStatus
            ? `Last delivery: ${git.lastDeliveryStatus}${
                git.lastDeliveryAt
                  ? ` · ${formatDateTime(git.lastDeliveryAt)}`
                  : ""
              }`
            : "Webhook is live — push to the production branch to deploy."
        }
        trailing={
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onDisconnect}
          >
            Disable
          </Button>
        }
      />

      {git?.lastDeliveryError ? (
        <Alert variant="destructive">
          <AlertTitle>Last webhook failed</AlertTitle>
          <AlertDescription>
            {summarizeDeployError(git.lastDeliveryError)}
          </AlertDescription>
        </Alert>
      ) : null}

      {webhookSecretShown ? (
        <Alert>
          <AlertTitle>Webhook secret — copy once</AlertTitle>
          <AlertDescription className="font-mono text-xs break-all">
            {webhookSecretShown}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={onDeploy}>
          <RocketIcon data-icon="inline-start" />
          {pending ? "Deploying…" : "Deploy now"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowWebhook(!showWebhook)}
        >
          {showWebhook ? "Hide webhook setup" : "Webhook setup"}
        </Button>
      </div>

      {showWebhook && git?.webhookUrl ? (
        <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
          <SettingsHint>
            {git?.webhookManaged
              ? "Webhook is managed by deplow. Copy the URL only if you need to re-add it manually."
              : "Add this URL as a push webhook in your repo settings. Use the secret shown when connect could not register the hook automatically."}
          </SettingsHint>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-xs">
              {git.webhookUrl}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCopyWebhook(git.webhookUrl!)}
            >
              <CopyIcon data-icon="inline-start" />
              {copied === "webhook" ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ConnectSourceForm({
  pending,
  setGitProvider,
  setGitRepoUrl,
  setGitBranch,
  onConnect,
}: ProjectSettingsProps) {
  const [selection, setSelection] = useState<RepoSelectorValue | null>(null)

  function handleSelect(value: RepoSelectorValue | null) {
    setSelection(value)
    if (value) {
      setGitRepoUrl(value.cloneUrl)
      setGitBranch(value.branch)
      setGitProvider(value.provider)
    } else {
      setGitRepoUrl("")
    }
  }

  function handleConnect() {
    if (!selection?.cloneUrl) return
    onConnect({
      provider: selection.provider,
      repoUrl: selection.cloneUrl,
      branch: selection.branch || "main",
      fullName: selection.fullName,
      authMethod: selection.authMethod,
      installationId: selection.installationId,
      accessToken: selection.accessToken,
    })
  }

  return (
    <div className="space-y-4">
      <SettingsHint>
        Connect GitHub or GitLab once, pick a repo, and we register the push
        webhook for you.
      </SettingsHint>
      <RepoSelector onChange={handleSelect} />
      <Button
        disabled={pending || !selection?.cloneUrl}
        onClick={handleConnect}
        className="w-full sm:w-auto"
      >
        {pending
          ? "Connecting…"
          : selection
            ? `Connect ${selection.fullName}`
            : "Select a repository"}
      </Button>
    </div>
  )
}

function NetworkingBlock({
  projectSlug,
  publicUrl,
  copied,
  onCopyUrl,
}: ProjectSettingsProps) {
  const host = publicUrl
    ? publicUrl.replace(/^https?:\/\//, "")
    : `${projectSlug}.{baseDomain}`

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <SettingsGroupLabel>Public Networking</SettingsGroupLabel>
        <SettingsHint>
          Access this app publicly over HTTP via the platform proxy and
          cloudflared edge.
        </SettingsHint>
        {publicUrl ? (
          <ConnectionChip
            icon={GlobeIcon}
            label={
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 hover:underline"
              >
                {host}
                <ExternalLinkIcon className="size-3.5 shrink-0 opacity-70" />
              </a>
            }
            sublabel="Production · HTTPS"
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCopyUrl(publicUrl)}
              >
                <CopyIcon data-icon="inline-start" />
                {copied === "url" ? "Copied" : "Copy"}
              </Button>
            }
          />
        ) : (
          <div className="space-y-3 rounded-lg border border-dashed border-border/80 p-3">
            <SettingsHint>
              Public URLs come from the platform Domains settings (base domain +
              auto subdomains). After deploy, this app is served at{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                https://{projectSlug}.{"{baseDomain}"}
              </code>
              .
            </SettingsHint>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                render={<Link to="/domains" />}
              >
                <GlobeIcon data-icon="inline-start" />
                Open Domains
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <SettingsGroupLabel>Private Networking</SettingsGroupLabel>
        <SettingsHint>
          Reach platform data stores from the app container on the Docker
          network. You never assemble connection strings yourself.
        </SettingsHint>
        <ConnectionChip
          icon={CheckCircle2Icon}
          label={
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs">postgres</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-xs">redis</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-xs">minio</span>
            </span>
          }
          sublabel={
            <>
              Ready on the platform network · credentials injected as{" "}
              <code className="rounded bg-muted px-1 font-mono text-[10px]">
                DATABASE_URL
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1 font-mono text-[10px]">
                REDIS_URL
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1 font-mono text-[10px]">
                S3_*
              </code>
            </>
          }
        />
      </div>
    </div>
  )
}
