/**
 * Platform reverse proxy route manager.
 *
 * Writes Caddy route snippets so `Host: {slug}.{baseDomain}` → app container.
 * Postgres/Redis are never routed here.
 */

import {
  mkdirSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  readdirSync,
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

  publicUrlForService(
    projectSlug: string,
    serviceName: string,
    isPrimary: boolean,
  ): string | null {
    const slug = isPrimary ? projectSlug : `${projectSlug}-${serviceName}`
    return this.publicUrlForSlug(slug)
  }

  async upsertServiceRoute(input: {
    serviceId: string
    projectSlug: string
    serviceName: string
    isPrimary: boolean
    upstream: string
  }): Promise<ProxyRoute> {
    return this.upsertProductionRoute({
      projectId: input.serviceId,
      slug: input.isPrimary
        ? input.projectSlug
        : `${input.projectSlug}-${input.serviceName}`,
      upstream: input.upstream,
    })
  }

  async removeServiceRoute(serviceId: string): Promise<void> {
    return this.removeProjectRoute(serviceId)
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
    return this.routes.get(projectId)
  }

  listRoutes(): ProxyRoute[] {
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
    // Without a base domain, still write an internal comment-only file so
    // operators can see registered projects; Caddy needs a host matcher when domain is set.
    if (!route.hostname) {
      writeFileSync(
        file,
        `# project ${route.projectId} slug=${route.slug} upstream=${route.upstream}\n# Set DEPLOW_BASE_DOMAIN to enable Host routing\n`,
        "utf8",
      )
      return
    }
    const matcher = `proj_${route.projectId.replace(/[^a-zA-Z0-9]/g, "")}`
    const content = `@${matcher} host ${route.hostname}
handle @${matcher} {
	reverse_proxy ${route.upstream}
}
`
    writeFileSync(file, content, "utf8")
  }

  /** Load existing route files from disk into memory (best-effort). */
  hydrateFromDisk(): number {
    if (!existsSync(this.routesDir)) return 0
    let n = 0
    for (const name of readdirSync(this.routesDir)) {
      if (!name.endsWith(".caddy")) continue
      // project id encoded in filename
      n++
    }
    return n
  }
}

function normalizeUpstream(upstream: string): string {
  const t = upstream.trim()
  if (t.startsWith("http://") || t.startsWith("https://")) return t
  return `http://${t}`
}
