/**
 * GitHub / GitLab remote API helpers for repo + branch pickers.
 * Framework-agnostic; token is never logged.
 */

export type GitProvider = "github" | "gitlab"

export interface RemoteRepo {
  id: string
  fullName: string
  name: string
  owner: string
  description: string | null
  private: boolean
  defaultBranch: string
  /** HTTPS clone URL (preferred for webhook deploys) */
  cloneUrl: string
  htmlUrl: string
  updatedAt: string | null
}

export interface ListReposResult {
  repos: RemoteRepo[]
  /** Hint when the API truncated results */
  truncated: boolean
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "User-Agent": "deplow",
  }
}

/**
 * List repositories the token can access.
 * GitHub: user repos (affiliation owner,collaborator,organization_member).
 * GitLab: membership projects.
 */
export async function listRemoteRepos(input: {
  provider: GitProvider
  token: string
  /** Optional case-insensitive filter on full name / description */
  query?: string
  /** Max pages to fetch (each page ~100). Default 2. */
  maxPages?: number
  fetchImpl?: typeof fetch
}): Promise<ListReposResult> {
  const token = input.token.trim()
  if (!token)
    throw new Error("A personal access token is required to list repositories")

  const fetchFn = input.fetchImpl ?? fetch
  const maxPages = input.maxPages ?? 2
  const query = input.query?.trim().toLowerCase() ?? ""

  if (input.provider === "github") {
    return listGithubRepos(token, query, maxPages, fetchFn)
  }
  return listGitlabRepos(token, query, maxPages, fetchFn)
}

export async function listRemoteBranches(input: {
  provider: GitProvider
  token: string
  /** owner/repo for GitHub, or path with namespace for GitLab */
  fullName: string
  fetchImpl?: typeof fetch
}): Promise<string[]> {
  const token = input.token.trim()
  if (!token)
    throw new Error("A personal access token is required to list branches")
  const fetchFn = input.fetchImpl ?? fetch
  if (input.provider === "github") {
    return listGithubBranches(token, input.fullName, fetchFn)
  }
  return listGitlabBranches(token, input.fullName, fetchFn)
}

/** Build clone URL from shorthand `owner/repo` or full URL. */
export function normalizeRepoUrl(provider: GitProvider, input: string): string {
  const raw = input.trim()
  if (!raw) throw new Error("Repository is required")
  if (/^https?:\/\//i.test(raw) || raw.startsWith("git@")) {
    return raw.endsWith(".git") ? raw : `${raw.replace(/\/$/, "")}.git`
  }
  // owner/repo
  const m = raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/)
  if (!m) {
    throw new Error(
      "Use owner/repo (e.g. acme/api) or a full https:// clone URL",
    )
  }
  const [, owner, name] = m
  if (provider === "gitlab") {
    return `https://gitlab.com/${owner}/${name}.git`
  }
  return `https://github.com/${owner}/${name}.git`
}

async function listGithubRepos(
  token: string,
  query: string,
  maxPages: number,
  fetchFn: typeof fetch,
): Promise<ListReposResult> {
  const repos: RemoteRepo[] = []
  let truncated = false

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL("https://api.github.com/user/repos")
    url.searchParams.set("per_page", "100")
    url.searchParams.set("sort", "updated")
    url.searchParams.set("direction", "desc")
    url.searchParams.set(
      "affiliation",
      "owner,collaborator,organization_member",
    )
    url.searchParams.set("page", String(page))

    const res = await fetchFn(url, { headers: authHeaders(token) })
    if (!res.ok) {
      throw await apiError("GitHub", res)
    }
    const data = (await res.json()) as Array<Record<string, unknown>>
    if (!Array.isArray(data)) break
    for (const r of data) {
      const fullName = String(r.full_name ?? "")
      const ownerLogin =
        typeof r.owner === "object" && r.owner && "login" in r.owner
          ? String((r.owner as { login: string }).login)
          : (fullName.split("/")[0] ?? "")
      const name = String(r.name ?? fullName.split("/")[1] ?? "")
      const item: RemoteRepo = {
        id: String(r.id ?? fullName),
        fullName,
        name,
        owner: ownerLogin,
        description: r.description ? String(r.description) : null,
        private: Boolean(r.private),
        defaultBranch: String(r.default_branch ?? "main"),
        cloneUrl: String(r.clone_url ?? `https://github.com/${fullName}.git`),
        htmlUrl: String(r.html_url ?? `https://github.com/${fullName}`),
        updatedAt: r.updated_at ? String(r.updated_at) : null,
      }
      if (
        !query ||
        item.fullName.toLowerCase().includes(query) ||
        (item.description?.toLowerCase().includes(query) ?? false)
      ) {
        repos.push(item)
      }
    }
    if (data.length < 100) break
    if (page === maxPages) truncated = true
  }

  return { repos, truncated }
}

async function listGithubBranches(
  token: string,
  fullName: string,
  fetchFn: typeof fetch,
): Promise<string[]> {
  const [owner, repo] = fullName.split("/")
  if (!owner || !repo) throw new Error("Invalid repository name")
  const branches: string[] = []
  for (let page = 1; page <= 3; page++) {
    const url = new URL(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`,
    )
    url.searchParams.set("per_page", "100")
    url.searchParams.set("page", String(page))
    const res = await fetchFn(url, { headers: authHeaders(token) })
    if (!res.ok) throw await apiError("GitHub", res)
    const data = (await res.json()) as Array<{ name?: string }>
    if (!Array.isArray(data) || data.length === 0) break
    for (const b of data) {
      if (b.name) branches.push(b.name)
    }
    if (data.length < 100) break
  }
  return branches
}

async function listGitlabRepos(
  token: string,
  query: string,
  maxPages: number,
  fetchFn: typeof fetch,
): Promise<ListReposResult> {
  const repos: RemoteRepo[] = []
  let truncated = false
  const base = process.env.DEPLOW_GITLAB_API_URL ?? "https://gitlab.com/api/v4"

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(`${base.replace(/\/$/, "")}/projects`)
    url.searchParams.set("membership", "true")
    url.searchParams.set("simple", "true")
    url.searchParams.set("order_by", "last_activity_at")
    url.searchParams.set("sort", "desc")
    url.searchParams.set("per_page", "100")
    url.searchParams.set("page", String(page))
    if (query) url.searchParams.set("search", query)

    const res = await fetchFn(url, {
      headers: {
        "PRIVATE-TOKEN": token,
        Accept: "application/json",
        "User-Agent": "deplow",
      },
    })
    if (!res.ok) throw await apiError("GitLab", res)
    const data = (await res.json()) as Array<Record<string, unknown>>
    if (!Array.isArray(data)) break
    for (const r of data) {
      const pathWithNs = String(r.path_with_namespace ?? r.path ?? "")
      const parts = pathWithNs.split("/")
      const name = parts[parts.length - 1] ?? pathWithNs
      const owner = parts.slice(0, -1).join("/") || "—"
      repos.push({
        id: String(r.id ?? pathWithNs),
        fullName: pathWithNs,
        name,
        owner,
        description: r.description ? String(r.description) : null,
        private: r.visibility ? String(r.visibility) !== "public" : true,
        defaultBranch: String(r.default_branch ?? "main"),
        cloneUrl: String(
          r.http_url_to_repo ?? `https://gitlab.com/${pathWithNs}.git`,
        ),
        htmlUrl: String(r.web_url ?? `https://gitlab.com/${pathWithNs}`),
        updatedAt: r.last_activity_at ? String(r.last_activity_at) : null,
      })
    }
    if (data.length < 100) break
    if (page === maxPages) truncated = true
  }

  return { repos, truncated }
}

async function listGitlabBranches(
  token: string,
  fullName: string,
  fetchFn: typeof fetch,
): Promise<string[]> {
  const base = process.env.DEPLOW_GITLAB_API_URL ?? "https://gitlab.com/api/v4"
  const project = encodeURIComponent(fullName)
  const branches: string[] = []
  for (let page = 1; page <= 3; page++) {
    const url = new URL(
      `${base.replace(/\/$/, "")}/projects/${project}/repository/branches`,
    )
    url.searchParams.set("per_page", "100")
    url.searchParams.set("page", String(page))
    const res = await fetchFn(url, {
      headers: {
        "PRIVATE-TOKEN": token,
        Accept: "application/json",
        "User-Agent": "deplow",
      },
    })
    if (!res.ok) throw await apiError("GitLab", res)
    const data = (await res.json()) as Array<{ name?: string }>
    if (!Array.isArray(data) || data.length === 0) break
    for (const b of data) {
      if (b.name) branches.push(b.name)
    }
    if (data.length < 100) break
  }
  return branches
}

async function apiError(provider: string, res: Response): Promise<Error> {
  let detail = res.statusText
  try {
    const body = (await res.json()) as { message?: string; error?: string }
    detail = body.message || body.error || detail
  } catch {
    // ignore
  }
  if (res.status === 401 || res.status === 403) {
    return new Error(
      `${provider} rejected the token (${res.status}). Create a PAT with repo read access and try again.`,
    )
  }
  return new Error(`${provider} API error (${res.status}): ${detail}`)
}
