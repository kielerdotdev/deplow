import { useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  EllipsisIcon,
  Link2Icon,
  PlugIcon,
} from "lucide-react"

import { CommandAction } from "@/components/command-action"
import { ConfirmActionDialog } from "@/components/confirm-action-dialog"
import { IntegrationCard } from "@/components/integration-card"
import { PageContent, PageHeader } from "@/components/page-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/settings/integrations")({
  loader: async () => {
    const session = await getSession()
    if (!session) throw redirect({ to: "/login", search: { redirect: undefined } })
    const shell = await loadShellContext()
    if (!shell.instanceAdmin) throw redirect({ to: "/" })
    const status = await client.git.connectionStatus()
    return { session, shell, status }
  },
  component: IntegrationsPage,
})

function IntegrationsPage() {
  const { status } = Route.useLoaderData()
  const router = useRouter()
  const search =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null
  const flashError = search?.get("error")
  const flashCreated = search?.get("github_app") === "created"

  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(flashError ?? null)
  const [info, setInfo] = useState<string | null>(null)
  const [deleteUrl, setDeleteUrl] = useState<string | null>(null)
  const [gitlabClientId, setGitlabClientId] = useState("")
  const [gitlabSecret, setGitlabSecret] = useState("")
  const [confirmAction, setConfirmAction] = useState<
    | "disconnect-github"
    | "disconnect-gitlab"
    | "remove-github-app"
    | "remove-gitlab"
    | null
  >(null)
  const [gitlabBase, setGitlabBase] = useState("https://gitlab.com")
  const [showGithubHelp, setShowGithubHelp] = useState(false)
  const [copied, setCopied] = useState(false)

  const githubLink = status.links.find((l) => l.provider === "github")
  const gitlabLink = status.links.find((l) => l.provider === "gitlab")

  async function createGitHubApp() {
    setPending(true)
    setError(null)
    try {
      const result = await client.git.githubAppManifestStart({
        origin: window.location.origin,
      })
      const { manifest, postUrl, warning } = result as {
        manifest: Record<string, unknown>
        postUrl: string
        warning?: string | null
      }
      if (warning) {
        console.info("[deplow]", warning)
      }
      const form = document.createElement("form")
      form.method = "POST"
      form.action = postUrl
      const input = document.createElement("input")
      input.type = "hidden"
      input.name = "manifest"
      input.value = JSON.stringify(manifest)
      form.appendChild(input)
      document.body.appendChild(form)
      form.submit()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPending(false)
    }
  }

  async function connect(provider: "github" | "gitlab") {
    setPending(true)
    setError(null)
    try {
      const { url } = await client.git.startOAuth({
        provider,
        returnTo: "/settings/integrations",
      })
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPending(false)
    }
  }

  async function disconnect(provider: "github" | "gitlab") {
    setPending(true)
    setError(null)
    setInfo(null)
    try {
      await client.git.disconnectProvider({ provider })
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      setPending(false)
    }
  }

  async function removeGitHubApp() {
    setPending(true)
    setError(null)
    setInfo(null)
    setDeleteUrl(null)
    try {
      const result = await client.git.removeGitHubApp({ uninstallRemote: true })
      setDeleteUrl(result.deleteOnGitHubUrl)
      setInfo(
        result.message +
          (result.uninstalled.length
            ? ` Uninstalled from: ${result.uninstalled.join(", ")}.`
            : "") +
          (result.remoteErrors.length
            ? ` Remote notes: ${result.remoteErrors.join("; ")}`
            : ""),
      )
      if (result.deleteOnGitHubUrl) {
        window.open(result.deleteOnGitHubUrl, "_blank", "noopener,noreferrer")
      }
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      setPending(false)
    }
  }

  async function removeGitLab() {
    setPending(true)
    setError(null)
    setInfo(null)
    try {
      await client.git.removeGitLabOAuth()
      setInfo("GitLab OAuth removed.")
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      setPending(false)
    }
  }

  async function saveGitLab() {
    setPending(true)
    setError(null)
    try {
      await client.git.saveGitLabOAuth({
        clientId: gitlabClientId,
        clientSecret: gitlabSecret,
        baseUrl: gitlabBase || undefined,
      })
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function copyCallbackUrl() {
    if (!status.githubOAuthCallbackUrl) return
    try {
      await navigator.clipboard.writeText(status.githubOAuthCallbackUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError("Could not copy callback URL")
    }
  }

  const githubDetail = !status.githubAppConfigured
    ? "Not set up"
    : githubLink
      ? `Connected as @${githubLink.login}`
      : "App ready — connect your account"

  const gitlabDetail = !status.gitlabOAuthConfigured
    ? "Not set up"
    : gitlabLink
      ? `Connected as @${gitlabLink.login}`
      : "OAuth ready — connect your account"

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect Git once. Projects reuse it for clone and deploy webhooks."
      />
      {!status.githubAppConfigured ? (
        <CommandAction
          id="integrations.github.create-app"
          label="Create GitHub App"
          keywords={["github", "app", "manifest"]}
          icon={PlugIcon}
          disabled={pending}
          onSelect={() => void createGitHubApp()}
        />
      ) : (
        <CommandAction
          id="integrations.github.connect"
          label={githubLink ? "Reconnect GitHub" : "Connect GitHub"}
          keywords={["github", "oauth", "git"]}
          icon={PlugIcon}
          disabled={pending}
          onSelect={() => void connect("github")}
        />
      )}
      {status.gitlabOAuthConfigured ? (
        <CommandAction
          id="integrations.gitlab.connect"
          label={gitlabLink ? "Reconnect GitLab" : "Connect GitLab"}
          keywords={["gitlab", "oauth", "git"]}
          icon={Link2Icon}
          disabled={pending}
          onSelect={() => void connect("gitlab")}
        />
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {info ? (
        <Alert>
          <AlertTitle>Done</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>{info}</p>
            {deleteUrl ? (
              <p>
                Finish deletion on GitHub:{" "}
                <a
                  className="font-medium underline underline-offset-2"
                  href={deleteUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Advanced settings
                </a>
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {flashCreated ? (
        <Alert>
          <AlertTitle>GitHub App created</AlertTitle>
          <AlertDescription>
            Connect GitHub, then install the App on your account or org.
          </AlertDescription>
        </Alert>
      ) : null}

      <PageContent width="narrow">
        <IntegrationCard
          title="GitHub"
          icon={PlugIcon}
          detail={githubDetail}
          connected={Boolean(githubLink)}
          actions={
            !status.githubAppConfigured ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void createGitHubApp()}
              >
                Create App
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void connect("github")}
                >
                  {githubLink ? "Reconnect" : "Connect"}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant="outline"
                        aria-label="GitHub options"
                      />
                    }
                  >
                    <EllipsisIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-44">
                    <DropdownMenuGroup>
                      {status.installUrl ? (
                        <DropdownMenuItem
                          render={
                            <a
                              href={status.installUrl}
                              target="_blank"
                              rel="noreferrer"
                            />
                          }
                        >
                          Install on GitHub
                        </DropdownMenuItem>
                      ) : null}
                      {githubLink ? (
                        <DropdownMenuItem
                          disabled={pending}
                          onClick={() => setConfirmAction("disconnect-github")}
                        >
                          Disconnect account
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuGroup>
                    {(status.installUrl || githubLink) && (
                      <DropdownMenuSeparator />
                    )}
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        disabled={pending}
                        variant="destructive"
                        onClick={() => setConfirmAction("remove-github-app")}
                      >
                        Remove App
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )
          }
        >
          {status.githubAppConfigured && status.githubOAuthCallbackUrl ? (
            <div className="border-t border-border/60 pt-3">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowGithubHelp((v) => !v)}
                aria-expanded={showGithubHelp}
              >
                <span>Connect failing?</span>
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 transition-transform",
                    showGithubHelp && "rotate-180",
                  )}
                />
              </button>
              {showGithubHelp ? (
                <div className="flex flex-col mt-3 gap-2">
                  <p className="text-xs text-muted-foreground">
                    Add this callback URL on the GitHub App, then try Connect
                    again.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 font-mono text-[11px]">
                      {status.githubOAuthCallbackUrl}
                    </code>
                    <Button
                      size="icon-sm"
                      variant="outline"
                      onClick={() => void copyCallbackUrl()}
                      aria-label="Copy callback URL"
                    >
                      {copied ? <CheckIcon /> : <CopyIcon />}
                    </Button>
                  </div>
                  <a
                    className="inline-block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    href="https://github.com/settings/apps"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open GitHub Apps settings
                  </a>
                </div>
              ) : null}
            </div>
          ) : null}
        </IntegrationCard>

        <IntegrationCard
          title="GitLab"
          icon={Link2Icon}
          detail={gitlabDetail}
          connected={Boolean(gitlabLink)}
          actions={
            status.gitlabOAuthConfigured ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void connect("gitlab")}
                >
                  {gitlabLink ? "Reconnect" : "Connect"}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant="outline"
                        aria-label="GitLab options"
                      />
                    }
                  >
                    <EllipsisIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-44">
                    {gitlabLink ? (
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          disabled={pending}
                          onClick={() => setConfirmAction("disconnect-gitlab")}
                        >
                          Disconnect account
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    ) : null}
                    {gitlabLink ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        disabled={pending}
                        variant="destructive"
                        onClick={() => setConfirmAction("remove-gitlab")}
                      >
                        Remove OAuth
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : undefined
          }
        >
          {!status.gitlabOAuthConfigured ? (
            <form
              className="flex flex-col gap-3 border-t border-border/60 pt-4"
              onSubmit={(e) => {
                e.preventDefault()
                void saveGitLab()
              }}
            >
              <FieldGroup className="gap-3">
                <Field>
                  <Label htmlFor="gitlab-client-id">Application ID</Label>
                  <Input
                    id="gitlab-client-id"
                    value={gitlabClientId}
                    onChange={(e) => setGitlabClientId(e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field>
                  <Label htmlFor="gitlab-secret">Secret</Label>
                  <Input
                    id="gitlab-secret"
                    type="password"
                    value={gitlabSecret}
                    onChange={(e) => setGitlabSecret(e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field>
                  <Label htmlFor="gitlab-base">Instance URL</Label>
                  <Input
                    id="gitlab-base"
                    value={gitlabBase}
                    onChange={(e) => setGitlabBase(e.target.value)}
                    placeholder="https://gitlab.com"
                  />
                </Field>
              </FieldGroup>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={pending || !gitlabClientId || !gitlabSecret}
              >
                Save
              </Button>
            </form>
          ) : null}
        </IntegrationCard>
      </PageContent>

      <ConfirmActionDialog
        open={confirmAction === "disconnect-github"}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
        title="Disconnect GitHub"
        description="Disconnect this GitHub account from Deplow? Deployments that use it will stop syncing until you reconnect."
        confirmLabel="Disconnect"
        pending={pending}
        onConfirm={() => disconnect("github")}
      />
      <ConfirmActionDialog
        open={confirmAction === "disconnect-gitlab"}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
        title="Disconnect GitLab"
        description="Disconnect this GitLab account from Deplow? Deployments that use it will stop syncing until you reconnect."
        confirmLabel="Disconnect"
        pending={pending}
        onConfirm={() => disconnect("gitlab")}
      />
      <ConfirmActionDialog
        open={confirmAction === "remove-github-app"}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
        title="Remove GitHub App"
        description="Remove the GitHub App from this server? You may need to finish deletion on github.com."
        confirmLabel="Remove App"
        pending={pending}
        onConfirm={() => removeGitHubApp()}
      />
      <ConfirmActionDialog
        open={confirmAction === "remove-gitlab"}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
        title="Remove GitLab OAuth"
        description="Remove GitLab OAuth from this server? Connected accounts will be unlinked."
        confirmLabel="Remove OAuth"
        pending={pending}
        onConfirm={() => removeGitLab()}
      />
    </>
  )
}
