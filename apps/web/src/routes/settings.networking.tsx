import { useMemo, useState } from "react"
import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router"
import { ChevronDownIcon, GlobeIcon } from "lucide-react"
import type { PlatformEdgeMode, ProxyIngressStatus } from "@hostrig/shared"

import { CommandAction } from "@/components/command-action"
import { NetbirdEdgeWizard } from "@/components/netbird-edge-wizard"
import { SettingsPage, SettingsPanel } from "@/components/page-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/settings/networking")({
  loader: async () => {
    const session = await getSession()
    if (!session)
      throw redirect({ to: "/login", search: { redirect: undefined } })
    const shell = await loadShellContext()
    if (!shell.instanceAdmin) throw redirect({ to: "/" })
    const [proxy, cluster, netbird] = await Promise.all([
      client.platform.proxyStatus(),
      client.cluster.get(),
      client.edge.netbirdStatus(),
    ])
    return { session, shell, proxy, cluster, netbird }
  },
  component: NetworkingPage,
})

function StatusDot({ ok }: { ok: boolean | null }) {
  return (
    <span
      className={cn(
        "inline-block size-1.5 rounded-full",
        ok === true
          ? "bg-success"
          : ok === false
            ? "bg-muted-foreground/35"
            : "bg-muted-foreground/35",
      )}
      aria-hidden
    />
  )
}

const EDGE_OPTIONS: Array<{
  value: PlatformEdgeMode
  label: string
  hint: string
}> = [
  {
    value: "cloudflare",
    label: "Cloudflare Tunnel",
    hint: "cloudflared on the k3s server → Traefik",
  },
  {
    value: "netbird",
    label: "Netbird",
    hint: "Netbird reverse proxy → Traefik",
  },
  {
    value: "tailscale",
    label: "Tailscale Serve",
    hint: "tailscale serve → Traefik",
  },
  {
    value: "local",
    label: "Local only",
    hint: "No remote edge (not for published k3s apps)",
  },
]

function NetworkingForm({
  proxy,
  clusterConnected,
  edgeCommands,
}: {
  proxy: ProxyIngressStatus
  clusterConnected: boolean
  edgeCommands: {
    netbird: string
    tailscale: string
    cloudflareOrigin: string
  }
}) {
  const router = useRouter()
  const [baseDomain, setBaseDomain] = useState(proxy.baseDomain)
  const [publicProtocol, setPublicProtocol] = useState(proxy.publicProtocol)
  const [autoDomainsEnabled, setAutoDomainsEnabled] = useState(
    proxy.autoDomainsEnabled,
  )
  const [edgeMode, setEdgeMode] = useState<PlatformEdgeMode>(proxy.edgeMode)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const dirty =
    baseDomain !== proxy.baseDomain ||
    publicProtocol !== proxy.publicProtocol ||
    autoDomainsEnabled !== proxy.autoDomainsEnabled ||
    edgeMode !== proxy.edgeMode

  const previewHost = useMemo(() => {
    const domain = baseDomain.trim()
    if (!domain) return null
    return `my-service.${domain}`
  }, [baseDomain])

  async function save() {
    setPending(true)
    setError(null)
    try {
      await client.platform.ingressUpdate({
        baseDomain,
        publicProtocol,
        autoDomainsEnabled,
        edgeMode,
      })
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function copyText(key: string, text: string) {
    await navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1500)
  }

  const origin = proxy.traefikOrigin
  const wildcardDns = baseDomain.trim()
    ? `*.${baseDomain.trim()}`
    : "*.{baseDomain}"

  return (
    <>
      <SettingsPanel
        title="Public address"
        description="Base domain and edge in front of Traefik. The cluster itself has no public IP path — edges terminate TLS and forward to Traefik on the k3s server."
        footer={
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !dirty}
              onClick={() => {
                setBaseDomain(proxy.baseDomain)
                setPublicProtocol(proxy.publicProtocol)
                setAutoDomainsEnabled(proxy.autoDomainsEnabled)
                setEdgeMode(proxy.edgeMode)
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={pending || !dirty}
              onClick={() => void save()}
            >
              {pending ? "Saving…" : "Save changes"}
            </Button>
            {error ? (
              <span className="text-xs text-destructive">{error}</span>
            ) : null}
          </>
        }
      >
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="base-domain">Base domain</Label>
            <Input
              id="base-domain"
              className="font-mono text-sm"
              placeholder="apps.example.com"
              value={baseDomain}
              onChange={(e) => setBaseDomain(e.target.value)}
              autoComplete="off"
            />
            {proxy.localhostBlocked ||
            (clusterConnected &&
              (baseDomain.includes("localhost") ||
                baseDomain.trim() === "apps.localhost")) ? (
              <p className="text-xs text-destructive">
                apps.localhost cannot reach a remote cluster. Use a real domain
                served by your edge.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edge-mode">Edge</Label>
            <select
              id="edge-mode"
              className="flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={edgeMode}
              onChange={(e) =>
                setEdgeMode(e.target.value as PlatformEdgeMode)
              }
            >
              {EDGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {EDGE_OPTIONS.find((o) => o.value === edgeMode)?.hint}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="public-protocol">Protocol (at the edge)</Label>
            <select
              id="public-protocol"
              className="flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={publicProtocol}
              onChange={(e) =>
                setPublicProtocol(e.target.value as "https" | "http")
              }
            >
              <option value="https">HTTPS</option>
              <option value="http">HTTP</option>
            </select>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={autoDomainsEnabled}
              onCheckedChange={(v) => setAutoDomainsEnabled(v === true)}
            />
            <span>
              Automatically assign subdomains to web services
              {previewHost ? (
                <span className="mt-1 block text-xs text-muted-foreground">
                  New web services will receive addresses such as{" "}
                  <code className="font-mono">
                    {publicProtocol}://{previewHost}
                  </code>
                </span>
              ) : null}
            </span>
          </label>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Point your edge at Traefik"
        description="Run these on the k3s server host (or any host that can reach Traefik on loopback :80). Traefik stays HTTP-only inside the cluster."
        action={
          !clusterConnected ? (
            <Button
              size="sm"
              variant="outline"
              render={<Link to="/settings/cluster" />}
            >
              Connect cluster
            </Button>
          ) : undefined
        }
      >
        {!clusterConnected ? (
          <Alert>
            <AlertTitle>Connect a cluster first</AlertTitle>
            <AlertDescription>
              Domains publish Ingress hosts on k3s. Edges only forward to
              Traefik — they are not a substitute for Settings → Cluster.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4 text-sm">
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Traefik origin
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void copyText("origin", origin)}
                >
                  {copiedKey === "origin" ? "Copied" : "Copy"}
                </Button>
              </div>
              <code className="block rounded-md border border-border bg-muted/20 px-3 py-2 font-mono text-xs">
                {origin}
              </code>
            </div>

            {edgeMode === "cloudflare" || edgeMode === "local" ? (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  Cloudflare Tunnel public hostname → HTTP service
                </p>
                <code className="block whitespace-pre-wrap rounded-md border border-border bg-muted/20 px-3 py-2 font-mono text-xs">
                  {`${wildcardDns} → ${edgeCommands.cloudflareOrigin}`}
                </code>
                <p className="mt-2 text-xs text-muted-foreground">
                  Or set{" "}
                  <code className="font-mono">CLOUDFLARE_TUNNEL_TOKEN</code> /
                  compose edge profile if you run cloudflared from the control
                  plane host with network access to the cluster Traefik port.
                </p>
              </div>
            ) : null}

            {edgeMode === "netbird" ? (
              <p className="text-xs text-muted-foreground">
                Use the NetBird guided setup below — paste an API token and
                Hostrig installs the agent and publishes services on deploy.
              </p>
            ) : null}

            {edgeMode === "tailscale" ? (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Tailscale Serve
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void copyText("tailscale", edgeCommands.tailscale)
                    }
                  >
                    {copiedKey === "tailscale" ? "Copied" : "Copy"}
                  </Button>
                </div>
                <code className="block whitespace-pre-wrap rounded-md border border-border bg-muted/20 px-3 py-2 font-mono text-xs">
                  {edgeCommands.tailscale}
                </code>
                <p className="mt-2 text-xs text-muted-foreground">
                  Serve HTTPS on the Tailnet; Traefik still receives HTTP with
                  the correct Host header.
                </p>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              DNS: point{" "}
              <code className="font-mono">{wildcardDns}</code> at your edge
              (Cloudflare hostname, Netbird domain, or Tailscale MagicDNS name)
              — not at a raw cluster public IP.
            </p>
          </div>
        )}
      </SettingsPanel>

      <SettingsPanel
        title="Edge connectivity"
        description="Cluster Traefik and tunnel token status for this installation."
      >
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          <li className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2">
              <StatusDot ok={proxy.clusterConnected} />
              k3s cluster
            </span>
            <span className="text-xs text-muted-foreground">
              {proxy.clusterConnected ? "Connected" : "Not connected"}
            </span>
          </li>
          <li className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2">
              <StatusDot ok={proxy.traefikReady} />
              Traefik
            </span>
            <span className="text-xs text-muted-foreground">
              {proxy.traefikReady ? "Detected" : "Not detected"}
            </span>
          </li>
          <li className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2">
              <StatusDot ok={proxy.edgeTokenConfigured} />
              Cloudflare Tunnel token
            </span>
            <span className="text-xs text-muted-foreground">
              {proxy.edgeTokenConfigured ? "Configured" : "Not configured"}
            </span>
          </li>
          <li className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2">
              <StatusDot
                ok={
                  publicProtocol === "https"
                    ? proxy.baseDomainConfigured
                    : null
                }
              />
              TLS certificate
            </span>
            <span className="text-xs text-muted-foreground">
              {publicProtocol === "https"
                ? proxy.baseDomainConfigured
                  ? "Managed at edge"
                  : "Needs base domain"
                : "HTTP mode"}
            </span>
          </li>
        </ul>

        <div className="mt-4">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
          >
            Advanced
            <ChevronDownIcon
              className={cn(
                "size-3.5 transition-transform",
                showAdvanced && "rotate-180",
              )}
            />
          </button>
          {showAdvanced ? (
            <dl className="mt-2 grid gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Traefik origin</dt>
                <dd className="font-mono">{proxy.traefikOrigin}</dd>
              </div>
              {proxy.caddyMessage ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{proxy.caddyMessage}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
      </SettingsPanel>
    </>
  )
}

function NetworkingPage() {
  const { proxy, cluster, netbird } = Route.useLoaderData()
  const needsOnboarding =
    !proxy.baseDomainConfigured || proxy.baseDomain.trim().length === 0

  return (
    <>
      <CommandAction
        id="domains.save-focus"
        label="Focus domain settings"
        keywords={["base", "domain", "proxy", "traefik", "networking"]}
        icon={GlobeIcon}
        onSelect={() => {
          document.getElementById("base-domain")?.focus()
        }}
      />
      <SettingsPage
        title="Networking & domains"
        description="Traefik Ingress hosts plus the edge (Cloudflare, Netbird, or Tailscale) that browsers use."
      >
        {needsOnboarding && proxy.edgeMode !== "netbird" ? (
          <Alert>
            <AlertTitle>Set a base domain to unlock public URLs</AlertTitle>
            <AlertDescription>
              Primary web services get{" "}
              <code className="font-mono text-xs">
                {"{service}.{baseDomain}"}
              </code>{" "}
              after deploy. Prefer NetBird guided setup below for the least
              manual work.
            </AlertDescription>
          </Alert>
        ) : null}
        <SettingsPanel
          title="NetBird guided setup"
          description="Paste a Personal Access Token — Hostrig installs the agent on k3s, sets Domains, and creates Reverse Proxy services on each deploy."
        >
          <NetbirdEdgeWizard
            key={`${netbird.status}:${netbird.baseDomain}:${netbird.hasPat}`}
            initial={netbird}
          />
        </SettingsPanel>
        <NetworkingForm
          key={`${proxy.baseDomain}:${proxy.publicProtocol}:${proxy.autoDomainsEnabled}:${proxy.edgeMode}`}
          proxy={proxy}
          clusterConnected={cluster.status === "connected"}
          edgeCommands={cluster.edgeCommands}
        />
      </SettingsPage>
    </>
  )
}
