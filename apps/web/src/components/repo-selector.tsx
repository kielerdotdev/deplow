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

const TOKEN_KEY = "deplow.git.pat"

function loadStoredToken(provider: "github" | "gitlab"): string {
  try {
    const raw = sessionStorage.getItem(`${TOKEN_KEY}.${provider}`)
    return raw ?? ""
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
  /** Called when user picks a repo + branch ready to connect */
  onChange: (value: RepoSelectorValue | null) => void
  className?: string
}

/**
 * Searchable GitHub/GitLab repository picker (PAT-backed).
 * Looks like a real source selector — not a raw clone URL field.
 */
export function RepoSelector({
  provider,
  onProviderChange,
  onChange,
  className,
}: RepoSelectorProps) {
  const [token, setToken] = useState("")
  const [tokenReady, setTokenReady] = useState(false)
  const [query, setQuery] = useState("")
  const [repos, setRepos] = useState<RemoteRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [usedPlatformToken, setUsedPlatformToken] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [branch, setBranch] = useState("main")
  const [branches, setBranches] = useState<string[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteUrl, setPasteUrl] = useState("")

  useEffect(() => {
    setToken(loadStoredToken(provider))
    setTokenReady(true)
    setRepos([])
    setSelectedId(null)
    setBranches([])
    setError(null)
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
      onChange({
        provider,
        cloneUrl: repo.cloneUrl,
        fullName: repo.fullName,
        branch: branchName,
      })
    },
    [onChange, provider],
  )

  async function loadRepos(opts?: { query?: string }) {
    setLoading(true)
    setError(null)
    try {
      const q = opts?.query ?? query
      const result = await client.projects.listGitRepos({
        provider,
        token: token.trim() || undefined,
        query: q.trim() || undefined,
      })
      setRepos(result.repos)
      setTruncated(result.truncated)
      setUsedPlatformToken(result.usedPlatformToken)
      if (token.trim()) storeToken(provider, token.trim())
      // keep selection if still present
      if (selectedId && !result.repos.some((r) => r.id === selectedId)) {
        setSelectedId(null)
        setBranches([])
        onChange(null)
      }
    } catch (e) {
      setRepos([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function selectRepo(repo: RemoteRepo) {
    setSelectedId(repo.id)
    setBranch(repo.defaultBranch || "main")
    setBranches([repo.defaultBranch || "main"])
    emit(repo, repo.defaultBranch || "main")
    setBranchesLoading(true)
    try {
      const result = await client.projects.listGitBranches({
        provider,
        fullName: repo.fullName,
        token: token.trim() || undefined,
      })
      if (result.branches.length > 0) {
        setBranches(result.branches)
        const next = result.branches.includes(repo.defaultBranch)
          ? repo.defaultBranch
          : result.branches[0]!
        setBranch(next)
        emit(repo, next)
      }
    } catch {
      // keep default branch
    } finally {
      setBranchesLoading(false)
    }
  }

  // Auto-load when platform token may exist or stored PAT present
  useEffect(() => {
    if (!tokenReady) return
    void loadRepos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenReady, provider])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return repos
    return repos.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false),
    )
  }, [repos, query])

  async function applyPaste() {
    setError(null)
    try {
      const { repoUrl } = await client.projects.normalizeGitRepoUrl({
        provider,
        input: pasteUrl.trim(),
      })
      const fake: RemoteRepo = {
        id: `paste:${repoUrl}`,
        fullName: pasteUrl.trim().replace(/\.git$/, ""),
        name: pasteUrl.trim(),
        owner: "",
        description: null,
        private: false,
        defaultBranch: branch || "main",
        cloneUrl: repoUrl,
        htmlUrl: repoUrl,
        updatedAt: null,
      }
      setSelectedId(fake.id)
      setRepos((prev) => {
        if (prev.some((r) => r.id === fake.id)) return prev
        return [fake, ...prev]
      })
      onChange({
        provider,
        cloneUrl: repoUrl,
        fullName: fake.fullName,
        branch: branch || "main",
      })
      setShowPaste(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex gap-2">
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

      <div className="flex flex-col gap-1.5 rounded-lg border border-border/80 bg-muted/15 p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <KeyRoundIcon className="size-3.5" />
          Personal access token
          {usedPlatformToken ? (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
              using server token
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              provider === "github"
                ? "ghp_… (repo scope)"
                : "glpat-… (read_api)"
            }
            className="min-w-[12rem] flex-1 font-mono text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void loadRepos()}
          >
            {loading ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-3.5" />
            )}
            Load repos
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Token stays in this browser session only (or set{" "}
          <code className="rounded bg-muted px-1 font-mono">
            DEPLOW_{provider === "github" ? "GITHUB" : "GITLAB"}_TOKEN
          </code>{" "}
          on the server). Needed to list private repos.
        </p>
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void loadRepos({ query })
            }
          }}
          placeholder="Search repositories…"
          className="pl-8"
          aria-label="Search repositories"
        />
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">
            {loading
              ? "Loading…"
              : filtered.length === 0
                ? "No repositories"
                : `${filtered.length} repositor${filtered.length === 1 ? "y" : "ies"}`}
            {truncated ? " · partial list" : ""}
          </p>
        </div>
        <ScrollArea className="h-56">
          {filtered.length === 0 && !loading ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              {token || usedPlatformToken
                ? "No matches. Try another search or paste a URL below."
                : "Add a PAT and load your repositories."}
            </div>
          ) : (
            <ul className="divide-y divide-border/50 p-1">
              {filtered.map((repo) => {
                const active = repo.id === selectedId
                return (
                  <li key={repo.id}>
                    <button
                      type="button"
                      onClick={() => void selectRepo(repo)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                        active
                          ? "bg-primary/15 ring-1 ring-primary/30"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border",
                        )}
                      >
                        {active ? <CheckIcon className="size-2.5" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium">
                            {repo.fullName}
                          </span>
                          {repo.private ? (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              <LockIcon className="size-2.5" />
                              Private
                            </span>
                          ) : null}
                        </div>
                        {repo.description ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {repo.description}
                          </p>
                        ) : null}
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          default · {repo.defaultBranch}
                        </p>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
      </div>

      {selected ? (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="repo-branch"
            className="flex items-center gap-1.5 text-sm font-medium leading-none"
          >
            <GitBranchIcon className="size-3.5" />
            Production branch
            {branchesLoading ? (
              <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
            ) : null}
          </label>
          {branches.length > 1 ? (
            <select
              id="repo-branch"
              value={branch}
              onChange={(e) => {
                const b = e.target.value
                setBranch(b)
                emit(selected, b)
              }}
              className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id="repo-branch"
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value)
                emit(selected, e.target.value)
              }}
              placeholder="main"
            />
          )}
        </div>
      ) : null}

      <div>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => setShowPaste((v) => !v)}
        >
          {showPaste ? "Hide URL paste" : "Or paste a clone URL / owner/repo"}
        </button>
        {showPaste ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Input
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              placeholder="acme/api or https://github.com/acme/api.git"
              className="min-w-[12rem] flex-1 font-mono text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!pasteUrl.trim()}
              onClick={() => void applyPaste()}
            >
              Use URL
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
