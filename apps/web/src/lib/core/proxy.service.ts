/**
 * Platform reverse proxy route manager.
 *
 * Writes Caddy route snippets so `Host: {slug}.{baseDomain}` → app container.
 * Filesystem is the source of truth; in-memory map is a rehydration cache.
 * Postgres/Redis are never routed here.
 */

import {
  mkdirSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs"
import path from "node:path"

import {
  productionHostname,
  productionPublicUrl,
  PREVIEW_HOSTNAME_PREFIX,
} from "./proxy-hostname"

export interface ProxyRoute {
  projectId: string
  slug: string
  /** Upstream target, e.g. http://deplow-abc12345-app:80 */
  upstream: string
  /** Full public URL when base domain is configured */
  publicUrl: string | null
  hostname: string | null
}

export interface ProxyServiceOptions {
  /** Directory for per-project Caddy snippets */
  routesDir: string
  /** Platform base domain, e.g. apps.example.com — empty disables public URLs */
  baseDomain: string
  /** Optional hook after route files change (e.g. caddy reload) */
  onChange?: () => Promise<void> | void
  /** Protocol for displayed public URLs */
  publicProtocol?: "https" | "http"
}

export class ProxyService {
  readonly previewHostnamePrefix = PREVIEW_HOSTNAME_PREFIX
  private readonly routesDir: string
  private readonly baseDomain: string
  private readonly onChange?: () => Promise<void> | void
  private readonly publicProtocol: "https" | "http"
  private readonly routes = new Map<string, ProxyRoute>()

  constructor(options: ProxyServiceOptions) {
    this.routesDir = options.routesDir
    this.baseDomain = (options.baseDomain ?? "").trim()
    this.onChange = options.onChange
    this.publicProtocol = options.publicProtocol ?? "https"
    mkdirSync(this.routesDir, { recursive: true })
    // Filesystem is truth — rehydrate cache on construct
    this.hydrateFromDisk()
  }

  get baseDomainConfigured(): boolean {
    return this.baseDomain.length > 0
  }

  /** Build the public URL for a production project slug (null if no base domain). */
  publicUrlForSlug(slug: string): string | null {
    if (!this.baseDomain) return null
    return productionPublicUrl(slug, this.baseDomain, {
      protocol: this.publicProtocol,
    })
  }

  hostnameForSlug(slug: string): string | null {
    if (!this.baseDomain) return null
    return productionHostname(slug, this.baseDomain)
  }

  /**
   * Upsert a production route for a project.
   * `upstream` is the reverse_proxy target (container DNS + port on platform network).
   */
  async upsertProductionRoute(input: {
    projectId: string
    slug: string
    /** e.g. deplow-abc12345-app:8080 or full http://... */
    upstream: string
  }): Promise<ProxyRoute> {
    const upstream = normalizeUpstream(input.upstream)
    const hostname = this.hostnameForSlug(input.slug)
    const publicUrl = this.publicUrlForSlug(input.slug)
    const route: ProxyRoute = {
      projectId: input.projectId,
      slug: input.slug,
      upstream,
      publicUrl,
      hostname,
    }
    this.routes.set(input.projectId, route)
    this.writeRouteFile(route)
    await this.onChange?.()
    return route
  }

  async removeProjectRoute(projectId: string): Promise<void> {
    this.routes.delete(projectId)
    const file = this.routeFilePath(projectId)
    if (existsSync(file)) {
      unlinkSync(file)
    }
    await this.onChange?.()
  }

  getRoute(projectId: string): ProxyRoute | undefined {
    // Prefer live map; fall back to disk if empty (e.g. after clear for tests)
    const cached = this.routes.get(projectId)
    if (cached) return cached
    this.hydrateFromDisk()
    return this.routes.get(projectId)
  }

  listRoutes(): ProxyRoute[] {
    if (this.routes.size === 0) {
      this.hydrateFromDisk()
    }
    return [...this.routes.values()]
  }

  /** Ensure Caddy base Caddyfile content (static template). */
  static baseCaddyfile(): string {
    return `{
	auto_https off
	admin off
}
:80 {
	import /etc/caddy/routes/*.caddy
	respond "deplow proxy — no matching project route" 404
}
`
  }

  private routeFilePath(projectId: string): string {
    const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, "_")
    return path.join(this.routesDir, `${safe}.caddy`)
  }

  private writeRouteFile(route: ProxyRoute): void {
    const file = this.routeFilePath(route.projectId)
    // Embed machine-readable metadata so rehydrate works without DB
    const meta = `# deplow-route projectId=${route.projectId} slug=${route.slug} upstream=${route.upstream}\n`
    if (!route.hostname) {
      writeFileSync(
        file,
        `${meta}# Set DEPLOW_BASE_DOMAIN to enable Host routing\n`,
        "utf8",
      )
      return
    }
    const matcher = `proj_${route.projectId.replace(/[^a-zA-Z0-9]/g, "")}`
    const content = `${meta}@${matcher} host ${route.hostname}
handle @${matcher} {
	reverse_proxy ${route.upstream}
}
`
    writeFileSync(file, content, "utf8")
  }

  /**
   * Load existing route files from disk into memory.
   * Call after control-plane restart so getRoute/listRoutes stay correct.
   */
  hydrateFromDisk(): number {
    this.routes.clear()
    if (!existsSync(this.routesDir)) return 0
    let n = 0
    for (const name of readdirSync(this.routesDir)) {
      if (!name.endsWith(".caddy")) continue
      const file = path.join(this.routesDir, name)
      let content: string
      try {
        content = readFileSync(file, "utf8")
      } catch {
        continue
      }
      const parsed = parseRouteFile(content, name)
      if (!parsed) continue
      // Refresh public URL from current base domain config
      const hostname = this.hostnameForSlug(parsed.slug)
      const publicUrl = this.publicUrlForSlug(parsed.slug)
      this.routes.set(parsed.projectId, {
        projectId: parsed.projectId,
        slug: parsed.slug,
        upstream: parsed.upstream,
        hostname,
        publicUrl,
      })
      n++
    }
    return n
  }
}

function parseRouteFile(
  content: string,
  filename: string,
): { projectId: string; slug: string; upstream: string } | null {
  const meta = content.match(
    /#\s*deplow-route\s+projectId=(\S+)\s+slug=(\S+)\s+upstream=(\S+)/,
  )
  if (meta) {
    return {
      projectId: meta[1]!,
      slug: meta[2]!,
      upstream: meta[3]!,
    }
  }
  // Legacy comment format: # project {id} slug={slug} upstream={upstream}
  const legacy = content.match(
    /#\s*project\s+(\S+)\s+slug=(\S+)\s+upstream=(\S+)/,
  )
  if (legacy) {
    return {
      projectId: legacy[1]!,
      slug: legacy[2]!,
      upstream: legacy[3]!,
    }
  }
  // Fallback: filename is projectId; try host + reverse_proxy lines
  const projectId = filename.replace(/\.caddy$/, "")
  const hostMatch = content.match(/host\s+(\S+)/)
  const upstreamMatch = content.match(/reverse_proxy\s+(\S+)/)
  if (!upstreamMatch) return null
  const hostname = hostMatch?.[1]
  const slug = hostname ? hostname.split(".")[0]! : projectId
  return {
    projectId,
    slug,
    upstream: upstreamMatch[1]!,
  }
}

function normalizeUpstream(upstream: string): string {
  const t = upstream.trim()
  if (t.startsWith("http://") || t.startsWith("https://")) return t
  return `http://${t}`
}
