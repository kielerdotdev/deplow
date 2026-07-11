import { useCallback, useEffect, useMemo, useState } from "react"
import {
  CheckIcon,
  GitBranchIcon,
  KeyRoundIcon,
  Loader2Icon,
  LockIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { client } from "@/lib/orpc"
import { cn } from "@/lib/utils"

export type RepoSelectorValue = {
  provider: "github" | "gitlab"
  cloneUrl: string
  fullName: string
  branch: string
  authMethod?: "github_app" | "oauth" | "pat" | "platform"
  installationId?: string
  /** Advanced PAT — only when user pasted one */
  accessToken?: string
}

type RemoteRepo = {
  id: string
  fullName: string
  name: string
  owner: string
  description: string | null
  private: boolean
  defaultBranch: string
  cloneUrl: string
  htmlUrl: string
  updatedAt: string | null
}

type ConnectionStatus = {
  githubAppConfigured: boolean
  gitlabOAuthConfigured: boolean
  installUrl: string | null
  links: Array<{
    provider: "github" | "gitlab"
    login: string | null
    avatarUrl: string | null
    githubInstallationId: string | null
    connected: boolean
  }>
}

const TOKEN_KEY = "deplow.git.pat"

function loadStoredToken(provider: "github" | "gitlab"): string {
  try {
    return sessionStorage.getItem(`${TOKEN_KEY}.${provider}`) ?? ""
  } catch {
    return ""
  }
}

function storeToken(provider: "github" | "gitlab", token: string) {
  try {
    if (token) sessionStorage.setItem(`${TOKEN_KEY}.${provider}`, token)
    else sessionStorage.removeItem(`${TOKEN_KEY}.${provider}`)
  } catch {
    // ignore
  }
}

type RepoSelectorProps = {
  provider: "github" | "gitlab"
  onProviderChange: (p: "github" | "gitlab") => void
  onChange: (value: RepoSelectorValue | null) => void
  className?: string
}

/**
 * Railway-style source picker: Connect provider → search repos.
 * PAT is Advanced only.
 */
export function RepoSelector({
  provider,
  onProviderChange,
  onChange,
  className,
}: RepoSelectorProps) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [token, setToken] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [query, setQuery] = useState("")
  const [repos, setRepos] = useState<RemoteRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [authSource, setAuthSource] = useState<string | null>(null)
  const [installationId, setInstallationId] = useState<string | undefined>()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [branch, setBranch] = useState("main")
  const [branches, setBranches] = useState<string[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteUrl, setPasteUrl] = useState("")
  const [oauthPending, setOauthPending] = useState(false)

  const link = status?.links.find((l) => l.provider === provider)

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const s = await client.git.connectionStatus()
      setStatus(s)
    } catch {
      setStatus(null)
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    setToken(loadStoredToken(provider))
    setRepos([])
    setSelectedId(null)
    setBranches([])
    setError(null)
    setAuthSource(null)
    onChange(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on provider switch only
  }, [provider])

  const selected = useMemo(
    () => repos.find((r) => r.id === selectedId) ?? null,
    [repos, selectedId],
  )

  const emit = useCallback(
    (repo: RemoteRepo | null, branchName: string) => {
      if (!repo) {
        onChange(null)
        return
      }
      const method =
        authSource === "github_app"
          ? ("github_app" as const)
          : authSource === "oauth"
            ? ("oauth" as const)
            : authSource === "platform"
              ? ("platform" as const)
              : token.trim()
                ? ("pat" as const)
                : undefined
      onChange({
        provider,
        cloneUrl: repo.cloneUrl,
        fullName: repo.fullName,
        branch: branchName,
        authMethod: method,
        installationId,
        accessToken: token.trim() || undefined,
      })
    },
    [authSource, installationId, onChange, provider, token],
  )

  async function loadRepos() {
    setLoading(true)
    setError(null)
    try {
      const result = await client.projects.listGitRepos({
        provider,
        token: token.trim() || undefined,
        query: query.trim() || undefined,
        installationId,
      })
      setRepos(result.repos as RemoteRepo[])
      setTruncated(result.truncated)
      setAuthSource(result.authSource ?? null)
      if (result.installationId) setInstallationId(result.installationId)
      if (token.trim()) storeToken(provider, token.trim())
      setSelectedId(null)
      onChange(null)
    } catch (e) {
      setRepos([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  // Auto-load when linked or platform/PAT available
  useEffect(() => {
    if (statusLoading) return
    if (link || token.trim()) {
      void loadRepos()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusLoading, provider, link?.login])

  async function selectRepo(repo: RemoteRepo) {
    setSelectedId(repo.id)
    setBranch(repo.defaultBranch || "main")
    setBranchesLoading(true)
    try {
      const result = await client.projects.listGitBranches({
        provider,
        fullName: repo.fullName,
        token: token.trim() || undefined,
      })
      setBranches(result.branches)
      const b = result.branches.includes(repo.defaultBranch)
        ? repo.defaultBranch
        : (result.branches[0] ?? "main")
      setBranch(b)
      emit(repo, b)
    } catch {
      setBranches([repo.defaultBranch || "main"])
      emit(repo, repo.defaultBranch || "main")
    } finally {
      setBranchesLoading(false)
    }
  }

  async function startOAuth() {
    setOauthPending(true)
    setError(null)
    try {
      const { url } = await client.git.startOAuth({
        provider,
        returnTo: window.location.pathname + window.location.search,
      })
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setOauthPending(false)
    }
  }

  async function applyPasteUrl() {
    setError(null)
    try {
      const { repoUrl } = await client.projects.normalizeGitRepoUrl({
        provider,
        input: pasteUrl.trim(),
      })
      const fullName =
        repoUrl
          .replace(/\.git$/, "")
          .split("/")
          .slice(-2)
          .join("/") || pasteUrl
      const synthetic: RemoteRepo = {
        id: "paste",
        fullName,
        name: fullName.split("/")[1] ?? fullName,
        owner: fullName.split("/")[0] ?? "",
        description: null,
        private: false,
        defaultBranch: "main",
        cloneUrl: repoUrl,
        htmlUrl: repoUrl.replace(/\.git$/, ""),
        updatedAt: null,
      }
      setRepos([synthetic])
      setSelectedId("paste")
      setBranch("main")
      emit(synthetic, "main")
      setShowPaste(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const configured =
    provider === "github"
      ? status?.githubAppConfigured
      : status?.gitlabOAuthConfigured

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={provider === "github" ? "default" : "outline"}
          onClick={() => onProviderChange("github")}
        >
          GitHub
        </Button>
        <Button
          type="button"
          size="sm"
          variant={provider === "gitlab" ? "default" : "outline"}
          onClick={() => onProviderChange("gitlab")}
        >
          GitLab
        </Button>
      </div>

      {statusLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" />
          Checking git connection…
        </p>
      ) : link ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <span>
            Connected as <strong>@{link.login ?? "user"}</strong>
            {link.githubInstallationId ? (
              <span className="text-muted-foreground"> · App installed</span>
            ) : null}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void loadRepos()}
              disabled={loading}
            >
              <RefreshCwIcon data-icon="inline-start" />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void startOAuth()}
              disabled={oauthPending}
            >
              Switch account
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-dashed p-4">
          <p className="text-sm text-muted-foreground">
            Connect once — then pick a repo. We register the webhook and clone
            with short-lived credentials.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void startOAuth()}
              disabled={oauthPending || configured === false}
            >
              {oauthPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              {provider === "github" ? "Connect GitHub" : "Connect GitLab"}
            </Button>
            {provider === "github" && status && !status.githubAppConfigured ? (
              <Button
                type="button"
                variant="outline"
                render={<a href="/integrations" />}
              >
                Set up GitHub App
              </Button>
            ) : null}
            {provider === "gitlab" && status && !status.gitlabOAuthConfigured ? (
              <Button
                type="button"
                variant="outline"
                render={<a href="/integrations" />}
              >
                Configure GitLab OAuth
              </Button>
            ) : null}
          </div>
          {configured === false ? (
            <p className="text-xs text-muted-foreground">
              {provider === "github"
                ? "GitHub App is not configured on this server yet."
                : "GitLab OAuth is not configured on this server yet."}{" "}
              You can still use a PAT under Advanced.
            </p>
          ) : null}
        </div>
      )}

      {(link || token.trim() || showAdvanced) && (
        <>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search repositories…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void loadRepos()
                }}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void loadRepos()}
            >
              {loading ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                "Load"
              )}
            </Button>
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          {repos.length > 0 ? (
            <ScrollArea className="h-48 rounded-lg border">
              <ul className="divide-y p-1">
                {repos.map((repo) => {
                  const active = repo.id === selectedId
                  return (
                    <li key={repo.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                          active && "bg-accent",
                        )}
                        onClick={() => void selectRepo(repo)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 font-medium">
                            {repo.private ? (
                              <LockIcon className="size-3 text-muted-foreground" />
                            ) : null}
                            <span className="truncate">{repo.fullName}</span>
                            {active ? (
                              <CheckIcon className="size-3.5 text-primary" />
                            ) : null}
                          </div>
                          {repo.description ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {repo.description}
                            </p>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </ScrollArea>
          ) : !loading && (link || token.trim()) ? (
            <p className="text-sm text-muted-foreground">
              No repositories loaded yet. Click Load or refresh after granting
              App access.
            </p>
          ) : null}

          {truncated ? (
            <p className="text-xs text-muted-foreground">
              Results truncated — refine your search.
            </p>
          ) : null}

          {selected ? (
            <div className="flex flex-wrap items-center gap-2">
              <GitBranchIcon className="size-3.5 text-muted-foreground" />
              <label className="text-sm text-muted-foreground" htmlFor="branch">
                Branch
              </label>
              {branchesLoading ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : branches.length > 0 ? (
                <select
                  id="branch"
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={branch}
                  onChange={(e) => {
                    setBranch(e.target.value)
                    emit(selected, e.target.value)
                  }}
                >
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  className="h-8 w-40"
                  value={branch}
                  onChange={(e) => {
                    setBranch(e.target.value)
                    emit(selected, e.target.value)
                  }}
                />
              )}
            </div>
          ) : null}
        </>
      )}

      <div className="space-y-2 border-t pt-3">
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Hide advanced" : "Advanced: PAT or paste git URL"}
        </button>
        {showAdvanced ? (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium">
                <KeyRoundIcon className="size-3" />
                Personal access token
              </label>
              <Input
                type="password"
                autoComplete="off"
                placeholder={
                  provider === "github" ? "ghp_… or github_pat_…" : "glpat-…"
                }
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Escape hatch when OAuth is unavailable. Prefer Connect{" "}
                {provider === "github" ? "GitHub" : "GitLab"}.
              </p>
            </div>
            <div>
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setShowPaste((v) => !v)}
              >
                Paste repository URL
              </button>
              {showPaste ? (
                <div className="mt-2 flex gap-2">
                  <Input
                    placeholder="acme/api or https://github.com/acme/api.git"
                    value={pasteUrl}
                    onChange={(e) => setPasteUrl(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void applyPasteUrl()}
                  >
                    Use
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
