import { useMemo, useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { ChevronDownIcon, GlobeIcon } from "lucide-react"
import type { ProxyIngressStatus } from "@deplow/shared"

import { CommandAction } from "@/components/command-action"
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
    const proxy = await client.platform.proxyStatus()
    return { session, shell, proxy }
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

function dnsHint(baseDomain: string): {
  type: string
  name: string
  target: string
} | null {
  const parts = baseDomain.trim().toLowerCase().split(".").filter(Boolean)
  if (parts.length < 2) return null
  const name = `*.${parts[0]}`
  const parent = parts.slice(1).join(".")
  return {
    type: "CNAME",
    name,
    target: `edge.${parent}`,
  }
}

function NetworkingForm({ proxy }: { proxy: ProxyIngressStatus }) {
  const router = useRouter()
  const [baseDomain, setBaseDomain] = useState(proxy.baseDomain)
  const [publicProtocol, setPublicProtocol] = useState(proxy.publicProtocol)
  const [autoDomainsEnabled, setAutoDomainsEnabled] = useState(
    proxy.autoDomainsEnabled,
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [copied, setCopied] = useState(false)

  const dirty =
    baseDomain !== proxy.baseDomain ||
    publicProtocol !== proxy.publicProtocol ||
    autoDomainsEnabled !== proxy.autoDomainsEnabled

  const previewHost = useMemo(() => {
    const domain = baseDomain.trim()
    if (!domain) return null
    return `my-service.${domain}`
  }, [baseDomain])

  const dns = useMemo(() => dnsHint(baseDomain), [baseDomain])

  async function save() {
    setPending(true)
    setError(null)
    try {
      await client.platform.ingressUpdate({
        baseDomain,
        publicProtocol,
        autoDomainsEnabled,
      })
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function copyDns() {
    if (!dns) return
    const text = `Type: ${dns.type}\nName: ${dns.name}\nTarget: ${dns.target}`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const proxyWarn =
    proxy.baseDomainConfigured &&
    (!proxy.caddyReachable || proxy.lastReloadOk === false)

  return (
    <>
      <SettingsPanel
        title="Public address"
        description="Platform base domain used for automatic service subdomains. Per-service hostnames are configured on each service."
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="public-protocol">Protocol</Label>
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

      {dns ? (
        <SettingsPanel
          title="DNS configuration"
          description="Create this wildcard record so traffic reaches your edge."
          action={
            <Button size="sm" variant="outline" onClick={() => void copyDns()}>
              {copied ? "Copied" : "Copy values"}
            </Button>
          }
        >
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Type</dt>
              <dd className="font-mono">{dns.type}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Name</dt>
              <dd className="font-mono">{dns.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Target</dt>
              <dd className="font-mono">{dns.target}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Point the target at your edge hostname (Cloudflare Tunnel, Tailscale
            Serve, or equivalent). Adjust the target to match your setup.
          </p>
        </SettingsPanel>
      ) : null}

      <SettingsPanel
        title="Edge connectivity"
        description="Proxy and tunnel health for this installation."
      >
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          <li className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2">
              <StatusDot ok={proxy.caddyReachable} />
              Caddy proxy
            </span>
            <span className="text-xs text-muted-foreground">
              {proxy.caddyReachable ? "Connected" : "Not reachable"}
            </span>
          </li>
          <li className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2">
              <StatusDot ok={proxy.edgeTokenConfigured} />
              Cloudflare Tunnel
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

        {!proxy.edgeTokenConfigured ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Configure Cloudflare Tunnel by setting the tunnel token in your
            deployment environment, then restart the edge profile.
          </p>
        ) : null}

        {proxyWarn ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Proxy misconfigured</AlertTitle>
            <AlertDescription>
              Base domain is set, but Caddy is not healthy.
              {proxy.lastReloadOk === false && proxy.lastReloadMessage
                ? ` Last reload: ${proxy.lastReloadMessage}`
                : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-4">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
          >
            Advanced proxy details
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
                <dt className="text-muted-foreground">Caddy origin</dt>
                <dd className="font-mono">{proxy.caddyOrigin}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Host origin</dt>
                <dd className="font-mono">{proxy.hostOrigin}</dd>
              </div>
              {proxy.lastReloadAt ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Last reload</dt>
                  <dd>{proxy.lastReloadAt}</dd>
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
  const { proxy } = Route.useLoaderData()
  const needsOnboarding =
    !proxy.baseDomainConfigured || proxy.baseDomain.trim().length === 0

  return (
    <>
      <CommandAction
        id="domains.save-focus"
        label="Focus domain settings"
        keywords={["base", "domain", "proxy", "caddy", "networking"]}
        icon={GlobeIcon}
        onSelect={() => {
          document.getElementById("base-domain")?.focus()
        }}
      />
      <SettingsPage
        title="Networking & domains"
        description="Platform routing, DNS, and edge connectivity for this installation."
      >
        {needsOnboarding ? (
          <Alert>
            <AlertTitle>Set a base domain to unlock public URLs</AlertTitle>
            <AlertDescription>
              Primary web services get{" "}
              <code className="font-mono text-xs">
                {"{service}.{baseDomain}"}
              </code>{" "}
              after deploy. Service-specific hostnames are managed on each
              service — not here.
            </AlertDescription>
          </Alert>
        ) : null}
        <NetworkingForm
          key={`${proxy.baseDomain}:${proxy.publicProtocol}:${proxy.autoDomainsEnabled}`}
          proxy={proxy}
        />
      </SettingsPage>
    </>
  )
}
