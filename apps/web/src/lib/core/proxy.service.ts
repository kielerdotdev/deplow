/**
 * Platform reverse proxy route manager.
 *
 * Writes Caddy route snippets so active Hostnames → app container.
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

/** Hostnames safe for Caddy `host` matchers (no spaces/newlines/metacharacters). */
export function isSafeCaddyHostname(host: string): boolean {
  const h = host.trim().toLowerCase()
  if (!h || h.length > 253) return false
  if (/[\s\r\n\t{}"'\\]/.test(h)) return false
  return (
    h === "localhost" ||
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(h)
  )
}

export interface ProxyRoute {
  /** Service id (route file key) */
  projectId: string
  slug: string
  /** Upstream target, e.g. http://hostrig-abc12345-app:80 */
  upstream: string
  /** Full public URL for the primary hostname when configured */
  publicUrl: string | null
  /** Primary / auto hostname (legacy single-host helpers) */
  hostname: string | null
  /** All active hostnames for this upstream (auto + custom + preview) */
  hostnames: string[]
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
  /** When false, auto subdomain assignment is off */
  autoDomainsEnabled?: boolean
}

export class ProxyService {
  readonly previewHostnamePrefix = PREVIEW_HOSTNAME_PREFIX
  private readonly routesDir: string
  private baseDomain: string
  private readonly onChange?: () => Promise<void> | void
  private publicProtocol: "https" | "http"
  private autoDomainsEnabled: boolean
  private readonly routes = new Map<string, ProxyRoute>()

  constructor(options: ProxyServiceOptions) {
    this.routesDir = options.routesDir
    this.baseDomain = (options.baseDomain ?? "").trim()
    this.onChange = options.onChange
    this.publicProtocol = options.publicProtocol ?? "https"
    this.autoDomainsEnabled = options.autoDomainsEnabled ?? true
    mkdirSync(this.routesDir, { recursive: true })
  }

  get baseDomainConfigured(): boolean {
    return this.baseDomain.length > 0 && this.autoDomainsEnabled
  }

  get configuredBaseDomain(): string {
    return this.baseDomain
  }

  get configuredPublicProtocol(): "https" | "http" {
    return this.publicProtocol
  }

  get autoDomainsActive(): boolean {
    return this.autoDomainsEnabled && this.baseDomain.length > 0
  }

  /** Update in-memory ingress settings (after DB save). Does not rewrite routes. */
  applySettings(input: {
    baseDomain: string
    publicProtocol: "https" | "http"
    autoDomainsEnabled: boolean
  }): void {
    this.baseDomain = (input.baseDomain ?? "").trim()
    this.publicProtocol = input.publicProtocol
    this.autoDomainsEnabled = input.autoDomainsEnabled
  }

  /** Build the public URL for a production project slug (null if auto domains off). */
  publicUrlForSlug(slug: string): string | null {
    if (!this.autoDomainsActive) return null
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

  publicUrlForHostname(hostname: string): string {
    return `${this.publicProtocol}://${hostname}`
  }

  async upsertServiceRoute(input: {
    serviceId: string
    projectSlug: string
    serviceName: string
    isPrimary: boolean
    upstream: string
    /** When set, use these hosts instead of deriving auto hostname alone */
    hostnames?: string[]
  }): Promise<ProxyRoute> {
    const slug = input.isPrimary
      ? input.projectSlug
      : `${input.projectSlug}-${input.serviceName}`
    const derived =
      this.autoDomainsActive && !input.hostnames
        ? this.hostnameForSlug(slug)
        : null
    const hostnames =
      input.hostnames?.filter(Boolean) ?? (derived ? [derived] : [])
    return this.upsertProductionRoute({
      projectId: input.serviceId,
      slug,
      upstream: input.upstream,
      hostnames,
    })
  }

  async removeServiceRoute(serviceId: string): Promise<void> {
    return this.removeProjectRoute(serviceId)
  }

  hostnameForSlug(slug: string): string | null {
    if (!this.autoDomainsActive) return null
    return productionHostname(slug, this.baseDomain)
  }

  /**
   * Upsert a production route for a service.
   * `upstream` is the reverse_proxy target (container DNS + port on platform network).
   */
  async upsertProductionRoute(input: {
    projectId: string
    slug: string
    /** e.g. hostrig-abc12345-app:8080 or full http://... */
    upstream: string
    /** All active hostnames (multi-host Caddy matcher) */
    hostnames?: string[]
  }): Promise<ProxyRoute> {
    const upstream = normalizeUpstream(input.upstream)
    const hostnames = (input.hostnames ?? []).map((h) => h.trim()).filter(Boolean)
    const primaryHostname = hostnames[0] ?? this.hostnameForSlug(input.slug)
    const allHosts =
      hostnames.length > 0
        ? hostnames
        : primaryHostname
          ? [primaryHostname]
          : []
    const publicUrl =
      allHosts.length > 0
        ? this.publicUrlForHostname(allHosts[0]!)
        : this.publicUrlForSlug(input.slug)
    const route: ProxyRoute = {
      projectId: input.projectId,
      slug: input.slug,
      upstream,
      publicUrl,
      hostname: allHosts[0] ?? null,
      hostnames: allHosts,
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
	handle /hostrig-health {
		respond "ok" 200
	}
	import /etc/caddy/routes/*.caddy
	respond "Hostrig proxy — no matching project route" 404
}
`
  }

  private routeFilePath(projectId: string): string {
    const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, "_")
    return path.join(this.routesDir, `${safe}.caddy`)
  }

  private writeRouteFile(route: ProxyRoute): void {
    const file = this.routeFilePath(route.projectId)
    if (route.hostnames.length === 0) {
      writeFileSync(
        file,
        `# service ${route.projectId} slug=${route.slug} upstream=${route.upstream}\n# No active hostnames — configure Domains in the app\n`,
        "utf8",
      )
      return
    }
    const safeHosts = route.hostnames.filter((h) => isSafeCaddyHostname(h))
    if (safeHosts.length === 0) {
      writeFileSync(
        file,
        `# service ${route.projectId} — no safe hostnames\n`,
        "utf8",
      )
      return
    }
    const matcher = `svc_${route.projectId.replace(/[^a-zA-Z0-9]/g, "")}`
    const hosts = safeHosts.join(" ")
    const content = `@${matcher} host ${hosts}
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
