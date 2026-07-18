import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  GitBranchIcon,
  KeyRoundIcon,
  Loader2Icon,
  LockIcon,
  RefreshCwIcon,
  SearchIcon,
  Settings2Icon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { client } from "@/lib/orpc"
import { cn } from "@/lib/utils"

export type RepoSelectorValue = {
  provider: "github" | "gitlab"
  cloneUrl: string
  fullName: string
  branch: string
  authMethod?: "github_app" | "oauth" | "pat" | "platform"
  installationId?: string
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

type ListedRepo = RemoteRepo & {
  provider: "github" | "gitlab"
  authSource: string | null
  installationId?: string
  listKey: string
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

const TOKEN_KEY = "hostrig.git.pat"
const SEARCH_DEBOUNCE_MS = 300
const BRANCH_SEARCH_THRESHOLD = 8

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

function ProviderIcon({
  provider,
  className,
}: {
  provider: "github" | "gitlab"
  className?: string
}) {
  if (provider === "gitlab") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className={cn("size-4 shrink-0", className)}
        fill="currentColor"
      >
        <path d="M23.955 13.2.045 13.2l2.26-6.96L4.56 1.2a.4.4 0 0 1 .76 0L7.58 6.24h8.84l2.26-5.04a.4.4 0 0 1 .76 0l2.255 5.04 2.26 6.96Zm-3.07.96-4.8 7.44L12 24l-4.085-2.4-4.8-7.44h17.57Z" />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      fill="currentColor"
    >
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  )
}

function authMethodFromSource(
  authSource: string | null,
  hasToken: boolean,
): RepoSelectorValue["authMethod"] {
  if (authSource === "github_app") return "github_app"
  if (authSource === "oauth") return "oauth"
  if (authSource === "platform") return "platform"
  if (hasToken) return "pat"
  return undefined
}

type RepoSelectorProps = {
  onChange: (value: RepoSelectorValue | null) => void
  className?: string
  disabled?: boolean
  /** @deprecated Provider is taken from the selected repository. */
  provider?: "github" | "gitlab"
  /** @deprecated Provider is taken from the selected repository. */
  onProviderChange?: (p: "github" | "gitlab") => void
}

/**
 * Compact source row: searchable repository (70%) + branch (30%).
 */
export function RepoSelector({
  onChange,
  className,
  disabled = false,
  onProviderChange,
}: RepoSelectorProps) {
  const listboxId = useId()
  const branchListboxId = useId()
  const searchRef = useRef<HTMLInputElement>(null)
  const branchSearchRef = useRef<HTMLInputElement>(null)

  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [tokens, setTokens] = useState<Record<"github" | "gitlab", string>>({
    github: "",
    gitlab: "",
  })
  const [open, setOpen] = useState(false)
  const [branchOpen, setBranchOpen] = useState(false)
  const [panel, setPanel] = useState<"repos" | "advanced">("repos")
  const [advancedProvider, setAdvancedProvider] = useState<
    "github" | "gitlab"
  >("github")
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [branchQuery, setBranchQuery] = useState("")
  const [repos, setRepos] = useState<ListedRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [selected, setSelected] = useState<ListedRepo | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [branch, setBranch] = useState("main")
  const [branches, setBranches] = useState<string[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [branchHighlight, setBranchHighlight] = useState(0)
  const [pasteUrl, setPasteUrl] = useState("")
  const [oauthPending, setOauthPending] = useState<"github" | "gitlab" | null>(
    null,
  )
  /**
   * When true, session PAT is sent to the API. Only set after "Browse with token"
   * so a leftover Advanced PAT cannot override a healthy OAuth/App connection.
   */
  const [preferPat, setPreferPat] = useState<
    Record<"github" | "gitlab", boolean>
  >({ github: false, gitlab: false })

  const githubLink = status?.links.find((l) => l.provider === "github")
  const gitlabLink = status?.links.find((l) => l.provider === "gitlab")
  const githubBrowsable = Boolean(githubLink || tokens.github.trim())
  const gitlabBrowsable = Boolean(gitlabLink || tokens.gitlab.trim())
  const canBrowse = githubBrowsable || gitlabBrowsable
  const connectedProviders = useMemo(() => {
    const list: Array<"github" | "gitlab"> = []
    if (githubBrowsable) list.push("github")
    if (gitlabBrowsable) list.push("gitlab")
    return list
  }, [githubBrowsable, gitlabBrowsable])

  function clearStoredPat(provider: "github" | "gitlab") {
    storeToken(provider, "")
    setTokens((prev) => ({ ...prev, [provider]: "" }))
    setPreferPat((prev) => ({ ...prev, [provider]: false }))
  }

  /** Only send session PAT when Advanced "Browse with token" was used. */
  function tokenForRequest(provider: "github" | "gitlab"): string | undefined {
    if (!preferPat[provider]) return undefined
    const t = tokens[provider].trim()
    return t || undefined
  }

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const s = await client.git.connectionStatus()
      setStatus(s)
      // Connected OAuth/App wins — drop any leftover Advanced PAT so it cannot
      // keep causing 401s against the live installation.
      const gh = s.links.find((l) => l.provider === "github")
      const gl = s.links.find((l) => l.provider === "gitlab")
      if (gh?.connected) {
        storeToken("github", "")
        setTokens((prev) => ({ ...prev, github: "" }))
        setPreferPat((prev) => ({ ...prev, github: false }))
      }
      if (gl?.connected) {
        storeToken("gitlab", "")
        setTokens((prev) => ({ ...prev, gitlab: "" }))
        setPreferPat((prev) => ({ ...prev, gitlab: false }))
      }
    } catch {
      setStatus(null)
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    setTokens({
      github: loadStoredToken("github"),
      gitlab: loadStoredToken("gitlab"),
    })
  }, [refreshStatus])

  useEffect(() => {
    const t = window.setTimeout(
      () => setDebouncedQuery(query.trim()),
      SEARCH_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(t)
  }, [query])

  const emit = useCallback(
    (repo: ListedRepo | null, branchName: string) => {
      if (!repo) {
        onChange(null)
        return
      }
      onProviderChange?.(repo.provider)
      const token = tokenForRequest(repo.provider) ?? ""
      onChange({
        provider: repo.provider,
        cloneUrl: repo.cloneUrl,
        fullName: repo.fullName,
        branch: branchName,
        authMethod: authMethodFromSource(repo.authSource, Boolean(token)),
        installationId: repo.installationId,
        accessToken: token || undefined,
      })
    },
    [onChange, onProviderChange, tokens, preferPat],
  )

  const loadRepos = useCallback(
    async (search: string) => {
      if (!canBrowse) {
        setRepos([])
        return
      }
      setLoading(true)
      setError(null)
      try {
        const providers = connectedProviders
        const results = await Promise.all(
          providers.map(async (provider) => {
            try {
              const result = await client.projects.listGitRepos({
                provider,
                token: tokenForRequest(provider),
                query: search || undefined,
              })
              return {
                provider,
                repos: result.repos as RemoteRepo[],
                truncated: result.truncated,
                authSource: result.authSource ?? null,
                installationId: result.installationId ?? undefined,
                error: null as string | null,
              }
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e)
              // Drop a bad Advanced PAT so the next refresh can use OAuth/App.
              if (
                preferPat[provider] &&
                (message.includes("401") ||
                  message.includes("403") ||
                  /rejected the (token|credentials)/i.test(message))
              ) {
                clearStoredPat(provider)
              }
              return {
                provider,
                repos: [] as RemoteRepo[],
                truncated: false,
                authSource: null,
                installationId: undefined,
                error: message,
              }
            }
          }),
        )

        const listed: ListedRepo[] = []
        let anyTruncated = false
        const errors: string[] = []
        for (const block of results) {
          if (block.error) errors.push(`${block.provider}: ${block.error}`)
          if (block.truncated) anyTruncated = true
          for (const repo of block.repos) {
            listed.push({
              ...repo,
              provider: block.provider,
              authSource: block.authSource,
              installationId: block.installationId,
              listKey: `${block.provider}:${repo.id}`,
            })
          }
        }
        setRepos(listed)
        setTruncated(anyTruncated)
        setError(
          listed.length === 0 && errors.length
            ? errors.join(" · ")
            : null,
        )
        setHighlight(0)
      } finally {
        setLoading(false)
      }
    },
    [canBrowse, connectedProviders, tokens, preferPat],
  )

  useEffect(() => {
    if (statusLoading || !canBrowse || panel !== "repos") return
    void loadRepos(debouncedQuery)
  }, [
    statusLoading,
    canBrowse,
    debouncedQuery,
    loadRepos,
    panel,
    githubLink?.login,
    gitlabLink?.login,
  ])

  useEffect(() => {
    if (open && panel === "repos") {
      window.setTimeout(() => searchRef.current?.focus(), 0)
    }
  }, [open, panel])

  useEffect(() => {
    if (branchOpen) {
      window.setTimeout(() => branchSearchRef.current?.focus(), 0)
    }
  }, [branchOpen])

  const groupedRepos = useMemo(() => {
    const github = repos.filter((r) => r.provider === "github")
    const gitlab = repos.filter((r) => r.provider === "gitlab")
    const showGroups = github.length > 0 && gitlab.length > 0
    if (!showGroups) {
      return [{ label: null as string | null, items: repos }]
    }
    return [
      { label: "GitHub", items: github },
      { label: "GitLab", items: gitlab },
    ]
  }, [repos])

  const flatRepos = useMemo(
    () => groupedRepos.flatMap((g) => g.items),
    [groupedRepos],
  )

  const filteredBranches = useMemo(() => {
    const q = branchQuery.trim().toLowerCase()
    if (!q) return branches
    return branches.filter((b) => b.toLowerCase().includes(q))
  }, [branchQuery, branches])

  const useBranchSearch = branches.length >= BRANCH_SEARCH_THRESHOLD

  async function selectRepo(repo: ListedRepo) {
    setSelected(repo)
    setOpen(false)
    setPanel("repos")
    setBranch(repo.defaultBranch || "main")
    setBranches([])
    setBranchQuery("")
    setBranchesLoading(true)
    onProviderChange?.(repo.provider)
    try {
      const result = await client.projects.listGitBranches({
        provider: repo.provider,
        fullName: repo.fullName,
        token: tokenForRequest(repo.provider),
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

  function selectBranch(next: string) {
    setBranch(next)
    setBranchOpen(false)
    setBranchQuery("")
    if (selected) emit(selected, next)
  }

  async function startOAuth(provider: "github" | "gitlab") {
    setOauthPending(provider)
    setError(null)
    try {
      const { url } = await client.git.startOAuth({
        provider,
        returnTo: window.location.pathname + window.location.search,
      })
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setOauthPending(null)
    }
  }

  async function disconnect(provider: "github" | "gitlab") {
    setError(null)
    try {
      await client.git.disconnectProvider({ provider })
      if (selected?.provider === provider) {
        setSelected(null)
        setBranches([])
        setBranch("main")
        onChange(null)
      }
      await refreshStatus()
      void loadRepos(debouncedQuery)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function applyPasteUrl() {
    setError(null)
    try {
      const { repoUrl } = await client.projects.normalizeGitRepoUrl({
        provider: advancedProvider,
        input: pasteUrl.trim(),
      })
      const fullName =
        repoUrl
          .replace(/\.git$/, "")
          .split("/")
          .slice(-2)
          .join("/") || pasteUrl
      const synthetic: ListedRepo = {
        id: "paste",
        listKey: `${advancedProvider}:paste`,
        fullName,
        name: fullName.split("/")[1] ?? fullName,
        owner: fullName.split("/")[0] ?? "",
        description: null,
        private: false,
        defaultBranch: "main",
        cloneUrl: repoUrl,
        htmlUrl: repoUrl.replace(/\.git$/, ""),
        updatedAt: null,
        provider: advancedProvider,
        authSource: tokens[advancedProvider].trim() ? "pat" : null,
      }
      setSelected(synthetic)
      setBranch("main")
      setBranches(["main"])
      setOpen(false)
      setPanel("repos")
      emit(synthetic, "main")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function onRepoKeyDown(event: React.KeyboardEvent) {
    if (disabled) return
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      event.preventDefault()
      setOpen(true)
      return
    }
    if (!open || panel !== "repos") return

    if (event.key === "Escape") {
      event.preventDefault()
      setOpen(false)
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlight((i) => Math.min(i + 1, Math.max(flatRepos.length - 1, 0)))
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlight((i) => Math.max(i - 1, 0))
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const repo = flatRepos[highlight]
      if (repo) void selectRepo(repo)
    }
  }

  function onBranchKeyDown(event: React.KeyboardEvent) {
    if (disabled || !selected) return
    if (!branchOpen && (event.key === "ArrowDown" || event.key === "Enter")) {
      event.preventDefault()
      setBranchOpen(true)
      return
    }
    if (!branchOpen) return
    if (event.key === "Escape") {
      event.preventDefault()
      setBranchOpen(false)
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setBranchHighlight((i) =>
        Math.min(i + 1, Math.max(filteredBranches.length - 1, 0)),
      )
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setBranchHighlight((i) => Math.max(i - 1, 0))
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const next = filteredBranches[branchHighlight]
      if (next) selectBranch(next)
    }
  }

  const triggerClass =
    "flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-left text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <div className="min-w-0 sm:basis-[70%] sm:grow">
          <Popover
            open={open && !disabled}
            onOpenChange={(next) => {
              if (disabled) return
              setOpen(next)
              if (!next) setPanel("repos")
            }}
          >
            <PopoverTrigger
              disabled={disabled}
              render={
                <button
                  type="button"
                  role="combobox"
                  aria-expanded={open}
                  aria-controls={listboxId}
                  aria-haspopup="listbox"
                  aria-autocomplete="list"
                  disabled={disabled}
                  onKeyDown={onRepoKeyDown}
                  className={cn(
                    triggerClass,
                    !selected && "text-muted-foreground",
                  )}
                />
              }
            >
              {selected ? (
                <ProviderIcon
                  provider={selected.provider}
                  className="text-foreground"
                />
              ) : (
                <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">
                {selected?.fullName ?? "Select a repository…"}
              </span>
              {selected?.private ? (
                <LockIcon className="size-3.5 shrink-0 text-muted-foreground" />
              ) : null}
              <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="w-[var(--anchor-width)] min-w-[min(100%,22rem)] gap-1.5 p-1.5"
              onKeyDown={onRepoKeyDown}
            >
              {panel === "advanced" ? (
                <div className="space-y-2.5 p-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">Git URL or access token</p>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => setPanel("repos")}
                    >
                      Back
                    </button>
                  </div>
                  <div className="flex rounded-lg border p-0.5">
                    {(["github", "gitlab"] as const).map((p) => (
                      <Button
                        key={p}
                        type="button"
                        size="sm"
                        variant={advancedProvider === p ? "secondary" : "ghost"}
                        className="h-7 flex-1 px-2"
                        onClick={() => setAdvancedProvider(p)}
                      >
                        <ProviderIcon provider={p} />
                        {p === "github" ? "GitHub" : "GitLab"}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <label className="flex items-center gap-1.5 text-xs font-medium">
                      <KeyRoundIcon className="size-3" />
                      Personal access token
                    </label>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder={
                        advancedProvider === "github"
                          ? "ghp_… or github_pat_…"
                          : "glpat-…"
                      }
                      value={tokens[advancedProvider]}
                      onChange={(e) => {
                        const value = e.target.value
                        setTokens((prev) => ({
                          ...prev,
                          [advancedProvider]: value,
                        }))
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium" htmlFor="paste-git-url">
                      Repository URL or owner/name
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="paste-git-url"
                        placeholder="acme/api or https://github.com/acme/api.git"
                        value={pasteUrl}
                        onChange={(e) => setPasteUrl(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!pasteUrl.trim()}
                        onClick={() => void applyPasteUrl()}
                      >
                        Use
                      </Button>
                    </div>
                  </div>
                  {tokens[advancedProvider].trim() ? (
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        const value = tokens[advancedProvider].trim()
                        storeToken(advancedProvider, value)
                        setPreferPat((prev) => ({
                          ...prev,
                          [advancedProvider]: true,
                        }))
                        setPanel("repos")
                        void loadRepos(debouncedQuery)
                      }}
                    >
                      Browse with token
                    </Button>
                  ) : null}
                  {preferPat[advancedProvider] &&
                  tokens[advancedProvider].trim() ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="w-full"
                      onClick={() => {
                        clearStoredPat(advancedProvider)
                        setPanel("repos")
                        void loadRepos(debouncedQuery)
                      }}
                    >
                      Clear saved token (use Connect instead)
                    </Button>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <div className="relative min-w-0 flex-1">
                      <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        ref={searchRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search repositories…"
                        className="h-8 pl-7"
                        role="searchbox"
                        aria-controls={listboxId}
                        aria-autocomplete="list"
                        disabled={!canBrowse}
                        aria-activedescendant={
                          open && flatRepos[highlight]
                            ? `${listboxId}-opt-${flatRepos[highlight]!.listKey}`
                            : undefined
                        }
                      />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={disabled}
                        render={
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Repository settings"
                            className="size-8 shrink-0"
                          />
                        }
                      >
                        <Settings2Icon className="size-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-44">
                        <DropdownMenuItem
                          disabled={loading || !canBrowse}
                          onClick={() => void loadRepos(debouncedQuery)}
                        >
                          <RefreshCwIcon />
                          Refresh
                        </DropdownMenuItem>
                        {githubLink ? (
                          <DropdownMenuItem
                            disabled={oauthPending === "github"}
                            onClick={() => void startOAuth("github")}
                          >
                            Switch GitHub account
                          </DropdownMenuItem>
                        ) : null}
                        {gitlabLink ? (
                          <DropdownMenuItem
                            disabled={oauthPending === "gitlab"}
                            onClick={() => void startOAuth("gitlab")}
                          >
                            Switch GitLab account
                          </DropdownMenuItem>
                        ) : null}
                        {githubLink || gitlabLink ? (
                          <DropdownMenuSeparator />
                        ) : null}
                        {githubLink ? (
                          <DropdownMenuItem
                            onClick={() => void disconnect("github")}
                          >
                            Disconnect GitHub
                          </DropdownMenuItem>
                        ) : null}
                        {gitlabLink ? (
                          <DropdownMenuItem
                            onClick={() => void disconnect("gitlab")}
                          >
                            Disconnect GitLab
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div
                    id={listboxId}
                    role="listbox"
                    aria-label="Repositories"
                    className="max-h-[280px] overflow-y-auto overscroll-contain"
                  >
                    {statusLoading ? (
                      <p className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                        <Loader2Icon className="size-3.5 animate-spin" />
                        Checking connections…
                      </p>
                    ) : !canBrowse ? (
                      <p className="px-2 py-3 text-xs text-muted-foreground">
                        Connect a provider below to browse repositories.
                      </p>
                    ) : loading ? (
                      <p className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                        <Loader2Icon className="size-3.5 animate-spin" />
                        Loading repositories…
                      </p>
                    ) : error ? (
                      <p className="px-2 py-3 text-xs text-destructive">{error}</p>
                    ) : flatRepos.length === 0 ? (
                      <p className="px-2 py-3 text-xs text-muted-foreground">
                        No repositories found.
                      </p>
                    ) : (
                      <div className="py-0.5">
                        {groupedRepos.map((group) => (
                          <div key={group.label ?? "all"}>
                            {group.label ? (
                              <p className="px-2 pt-1.5 pb-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                                {group.label}
                              </p>
                            ) : null}
                            <ul>
                              {group.items.map((repo) => {
                                const index = flatRepos.indexOf(repo)
                                const active =
                                  selected?.listKey === repo.listKey
                                const focused = index === highlight
                                return (
                                  <li key={repo.listKey} role="none">
                                    <button
                                      type="button"
                                      id={`${listboxId}-opt-${repo.listKey}`}
                                      role="option"
                                      aria-selected={active}
                                      className={cn(
                                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
                                        focused && "bg-accent",
                                        active && "font-medium",
                                      )}
                                      onMouseEnter={() => setHighlight(index)}
                                      onClick={() => void selectRepo(repo)}
                                    >
                                      <ProviderIcon
                                        provider={repo.provider}
                                        className="text-muted-foreground"
                                      />
                                      <span className="min-w-0 flex-1 truncate">
                                        {repo.fullName}
                                      </span>
                                      {repo.private ? (
                                        <LockIcon className="size-3 shrink-0 text-muted-foreground" />
                                      ) : null}
                                      {active ? (
                                        <CheckIcon className="size-3.5 shrink-0 text-primary" />
                                      ) : null}
                                    </button>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {truncated ? (
                    <p className="px-1 text-[11px] text-muted-foreground">
                      Results truncated — refine your search.
                    </p>
                  ) : null}

                  <div className="space-y-1 border-t pt-1.5">
                    {!githubLink ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-full justify-start"
                        disabled={
                          oauthPending === "github" ||
                          status?.githubAppConfigured === false
                        }
                        onClick={() => void startOAuth("github")}
                      >
                        {oauthPending === "github" ? (
                          <Loader2Icon className="size-3.5 animate-spin" />
                        ) : (
                          <ProviderIcon provider="github" />
                        )}
                        Connect GitHub
                      </Button>
                    ) : null}
                    {!gitlabLink ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-full justify-start"
                        disabled={
                          oauthPending === "gitlab" ||
                          status?.gitlabOAuthConfigured === false
                        }
                        onClick={() => void startOAuth("gitlab")}
                      >
                        {oauthPending === "gitlab" ? (
                          <Loader2Icon className="size-3.5 animate-spin" />
                        ) : (
                          <ProviderIcon provider="gitlab" />
                        )}
                        Connect GitLab
                      </Button>
                    ) : null}
                    {status?.githubAppConfigured === false && !githubLink ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-full justify-start text-muted-foreground"
                        render={<a href="/integrations" />}
                      >
                        Set up GitHub App
                      </Button>
                    ) : null}
                    <button
                      type="button"
                      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground"
                      onClick={() => setPanel("advanced")}
                    >
                      <KeyRoundIcon className="size-3.5" />
                      Use Git URL or access token
                    </button>
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <div className="min-w-0 sm:basis-[30%] sm:shrink-0">
          <Popover
            open={branchOpen && !disabled && Boolean(selected)}
            onOpenChange={(next) => {
              if (disabled || !selected) return
              setBranchOpen(next)
              if (!next) setBranchQuery("")
            }}
          >
            <PopoverTrigger
              disabled={disabled || !selected || branchesLoading}
              render={
                <button
                  type="button"
                  role="combobox"
                  aria-expanded={branchOpen}
                  aria-controls={branchListboxId}
                  aria-haspopup="listbox"
                  disabled={disabled || !selected || branchesLoading}
                  onKeyDown={onBranchKeyDown}
                  className={cn(
                    triggerClass,
                    !selected && "text-muted-foreground",
                  )}
                />
              }
            >
              <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {branchesLoading
                  ? "Loading…"
                  : selected
                    ? branch
                    : "Branch"}
              </span>
              <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="w-[var(--anchor-width)] min-w-[12rem] gap-1.5 p-1.5"
              onKeyDown={onBranchKeyDown}
            >
              {useBranchSearch ? (
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={branchSearchRef}
                    value={branchQuery}
                    onChange={(e) => {
                      setBranchQuery(e.target.value)
                      setBranchHighlight(0)
                    }}
                    placeholder="Search branches…"
                    className="h-8 pl-7"
                  />
                </div>
              ) : null}
              <div
                id={branchListboxId}
                role="listbox"
                aria-label="Branches"
                className="max-h-[240px] overflow-y-auto"
              >
                {filteredBranches.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">
                    No branches found.
                  </p>
                ) : (
                  <ul className="py-0.5">
                    {filteredBranches.map((b, index) => {
                      const active = b === branch
                      const focused = index === branchHighlight
                      return (
                        <li key={b} role="none">
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
                              focused && "bg-accent",
                              active && "font-medium",
                            )}
                            onMouseEnter={() => setBranchHighlight(index)}
                            onClick={() => selectBranch(b)}
                          >
                            <span className="min-w-0 flex-1 truncate">{b}</span>
                            {active ? (
                              <CheckIcon className="size-3.5 shrink-0 text-primary" />
                            ) : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  )
}
