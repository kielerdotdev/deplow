import { useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { Link2Icon, PlugIcon } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"

export const Route = createFileRoute("/integrations")({
  loader: async () => {
    const session = await getSession()
    if (!session) throw redirect({ to: "/login" })
    const status = await client.git.connectionStatus()
    return { session, status }
  },
  component: IntegrationsPage,
})

function IntegrationsPage() {
  const { session, status } = Route.useLoaderData()
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
  const [gitlabBase, setGitlabBase] = useState("https://gitlab.com")

  const githubLink = status.links.find((l) => l.provider === "github")
  const gitlabLink = status.links.find((l) => l.provider === "gitlab")

  async function createGitHubApp() {
    setPending(true)
    setError(null)
    try {
      const result = await client.git.githubAppManifestStart()
      const { manifest, postUrl, warning } = result as {
        manifest: Record<string, unknown>
        postUrl: string
        warning?: string | null
      }
      if (warning) {
        // Still proceed — manifest is valid without App webhook on localhost
        console.info("[deplow]", warning)
      }
      // GitHub manifest flow: POST form with JSON manifest
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
        returnTo: "/integrations",
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
    } finally {
      setPending(false)
    }
  }

  async function removeGitHubApp() {
    const ok = window.confirm(
      "Remove the GitHub App from deplow?\n\n" +
        "• Uninstalls the App from every GitHub account/org it is on\n" +
        "• Clears credentials stored on this server\n" +
        "• GitHub does not allow deleting the App registration via API — " +
        "you will get a link to finish deletion on github.com (Advanced → Delete)\n\n" +
        "Then create a new App with the correct callback URLs.",
    )
    if (!ok) return
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
      // Open GitHub Advanced page so the operator can delete the registration
      if (result.deleteOnGitHubUrl) {
        window.open(result.deleteOnGitHubUrl, "_blank", "noopener,noreferrer")
      }
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function removeGitLab() {
    const ok = window.confirm(
      "Remove GitLab OAuth credentials from this server? Connected GitLab accounts will be unlinked.",
    )
    if (!ok) return
    setPending(true)
    setError(null)
    setInfo(null)
    try {
      await client.git.removeGitLabOAuth()
      setInfo("GitLab OAuth removed from this server.")
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
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

  return (
    <AppShell
      user={session.user}
      title="Integrations"
      description="Connect GitHub and GitLab once — projects reuse your identity for private clone and auto webhooks"
    >
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {info ? (
        <Alert className="mb-4">
          <AlertTitle>Done</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{info}</p>
            {deleteUrl ? (
              <p>
                Finish on GitHub (Advanced → Delete GitHub App):{" "}
                <a
                  className="font-medium underline underline-offset-2"
                  href={deleteUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {deleteUrl}
                </a>
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {flashCreated ? (
        <Alert className="mb-4">
          <AlertTitle>GitHub App created</AlertTitle>
          <AlertDescription>
            Credentials are stored encrypted on this server. Next: Connect
            GitHub and install the App on your account or org.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlugIcon className="size-4" />
              GitHub App
            </CardTitle>
            <CardDescription>
              Best path for private repos and auto webhooks. Create the App
              once, then connect your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Status:{" "}
              <strong>
                {status.githubAppConfigured ? "Configured" : "Not configured"}
              </strong>
              {githubLink ? (
                <>
                  {" "}
                  · Linked as <strong>@{githubLink.login}</strong>
                </>
              ) : null}
            </p>
            <div className="flex flex-wrap gap-2">
              {!status.githubAppConfigured ? (
                <Button disabled={pending} onClick={() => void createGitHubApp()}>
                  Create GitHub App
                </Button>
              ) : (
                <>
                  <Button
                    disabled={pending}
                    onClick={() => void connect("github")}
                  >
                    {githubLink ? "Reconnect GitHub" : "Connect GitHub"}
                  </Button>
                  {status.installUrl ? (
                    <Button
                      variant="outline"
                      render={
                        <a
                          href={status.installUrl}
                          target="_blank"
                          rel="noreferrer"
                        />
                      }
                    >
                      Install App
                    </Button>
                  ) : null}
                  {githubLink ? (
                    <Button
                      variant="outline"
                      disabled={pending}
                      onClick={() => void disconnect("github")}
                    >
                      Disconnect
                    </Button>
                  ) : null}
                  <Button
                    variant="destructive"
                    disabled={pending}
                    onClick={() => void removeGitHubApp()}
                  >
                    Remove App
                  </Button>
                </>
              )}
            </div>
            {status.githubAppConfigured && status.githubOAuthCallbackUrl ? (
              <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1.5">
                <p className="font-medium text-foreground">
                  If Connect fails with “redirect_uri is not associated”
                </p>
                <p className="text-muted-foreground">
                  Add this exact URL under GitHub App →{" "}
                  <strong>Callback URL</strong> (Identifying and authorizing
                  users), then save:
                </p>
                <code className="block break-all rounded bg-background px-2 py-1.5 text-[11px]">
                  {status.githubOAuthCallbackUrl}
                </code>
                <p className="text-muted-foreground">
                  Also allowed for local dev:{" "}
                  <code className="text-[11px]">
                    http://localhost:3000/api/git/oauth/github/callback
                  </code>
                  . Open{" "}
                  <a
                    className="underline underline-offset-2"
                    href="https://github.com/settings/apps"
                    target="_blank"
                    rel="noreferrer"
                  >
                    github.com/settings/apps
                  </a>
                  .
                </p>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Set <code className="text-xs">DEPLOW_PUBLIC_URL</code> to this
              control plane before creating the App. GitHub rejects App
              webhooks on <code className="text-xs">localhost</code> — we omit
              that field when local. For push-to-deploy from the internet, use a
              tunnel (cloudflared / ngrok). Permissions: Contents (read),
              Metadata, Repository hooks (write).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2Icon className="size-4" />
              GitLab OAuth
            </CardTitle>
            <CardDescription>
              Create an Application on GitLab (or your self-hosted instance),
              then connect.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Status:{" "}
              <strong>
                {status.gitlabOAuthConfigured
                  ? "Configured"
                  : "Not configured"}
              </strong>
              {gitlabLink ? (
                <>
                  {" "}
                  · Linked as <strong>@{gitlabLink.login}</strong>
                </>
              ) : null}
            </p>
            {!status.gitlabOAuthConfigured ? (
              <div className="space-y-2">
                <Input
                  placeholder="Application ID"
                  value={gitlabClientId}
                  onChange={(e) => setGitlabClientId(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="Secret"
                  value={gitlabSecret}
                  onChange={(e) => setGitlabSecret(e.target.value)}
                />
                <Input
                  placeholder="Base URL (https://gitlab.com)"
                  value={gitlabBase}
                  onChange={(e) => setGitlabBase(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Redirect URI:{" "}
                  <code className="text-xs">
                    {"{DEPLOW_PUBLIC_URL}"}/api/git/oauth/gitlab/callback
                  </code>
                  · Scopes: read_api, read_repository, write_repository
                </p>
                <Button
                  disabled={pending || !gitlabClientId || !gitlabSecret}
                  onClick={() => void saveGitLab()}
                >
                  Save GitLab OAuth
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button disabled={pending} onClick={() => void connect("gitlab")}>
                  {gitlabLink ? "Reconnect GitLab" : "Connect GitLab"}
                </Button>
                {gitlabLink ? (
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => void disconnect("gitlab")}
                  >
                    Disconnect
                  </Button>
                ) : null}
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => void removeGitLab()}
                >
                  Remove GitLab OAuth
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
