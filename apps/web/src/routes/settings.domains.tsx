import { useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { GlobeIcon } from "lucide-react"
import type { ProxyIngressStatus } from "@deplow/shared"

import { CommandAction } from "@/components/command-action"
import { PageContent, PageHeader, SettingsPanel } from "@/components/page-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

export const Route = createFileRoute("/settings/domains")({
  loader: async () => {
    const session = await getSession()
    if (!session) throw redirect({ to: "/login", search: { redirect: undefined } })
    const shell = await loadShellContext()
    if (!shell.instanceAdmin) throw redirect({ to: "/" })
    const proxy = await client.platform.proxyStatus()
    return { session, shell, proxy }
  },
  component: DomainsPage,
})

function DomainsForm({ proxy }: { proxy: ProxyIngressStatus }) {
  const router = useRouter()
  const [baseDomain, setBaseDomain] = useState(proxy.baseDomain)
  const [publicProtocol, setPublicProtocol] = useState(proxy.publicProtocol)
  const [autoDomainsEnabled, setAutoDomainsEnabled] = useState(
    proxy.autoDomainsEnabled,
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const previewHost =
    baseDomain.trim().length > 0
      ? `${publicProtocol}://{project}.${baseDomain.trim()}`
      : null

  async function save() {
    setPending(true)
    setError(null)
    setSaved(false)
    try {
      await client.platform.ingressUpdate({
        baseDomain,
        publicProtocol,
        autoDomainsEnabled,
      })
      setSaved(true)
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  const proxyWarn =
    proxy.baseDomainConfigured &&
    (!proxy.caddyReachable || proxy.lastReloadOk === false)

  return (
    <div className="space-y-4">
      <SettingsPanel
        title="Platform domain"
        description={
          <>
            Auto subdomains for web services. Point a wildcard at your edge once
            (cloudflared, Tailscale Serve, or Netbird) →{" "}
            <code className="font-mono">{proxy.caddyOrigin}</code> or{" "}
            <code className="font-mono">{proxy.hostOrigin}</code>. Custom
            domains and preview hostnames come later.
          </>
        }
        footer={
          <>
            <Button size="sm" disabled={pending} onClick={() => void save()}>
              {pending ? "Saving…" : "Save domains"}
            </Button>
            {saved ? (
              <span className="text-xs text-muted-foreground">Saved</span>
            ) : null}
            {error ? (
              <span className="text-xs text-destructive">{error}</span>
            ) : null}
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="base-domain">Base domain</Label>
            <Input
              id="base-domain"
              className="font-mono text-sm"
              placeholder="apps.example.com"
              value={baseDomain}
              onChange={(e) => setBaseDomain(e.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              e.g. <code className="font-mono">*.apps.example.com</code> →
              tunnel.
              {previewHost ? (
                <>
                  {" "}
                  Primary web services get{" "}
                  <code className="font-mono">{previewHost}</code>.
                </>
              ) : null}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="public-protocol">URL protocol</Label>
            <select
              id="public-protocol"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={publicProtocol}
              onChange={(e) =>
                setPublicProtocol(e.target.value as "https" | "http")
              }
            >
              <option value="https">https</option>
              <option value="http">http</option>
            </select>
          </div>

          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={autoDomainsEnabled}
                onCheckedChange={(v) => setAutoDomainsEnabled(v === true)}
              />
              Auto-assign subdomains on deploy
            </label>
          </div>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Proxy status"
        description={
          <>
            Caddy health and Cloudflare tunnel token (compose profile{" "}
            <code className="font-mono">edge</code>).
          </>
        }
      >
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">Caddy</div>
            <div className="mt-0.5">
              {proxy.caddyReachable ? (
                <span className="text-xs text-muted-foreground">reachable</span>
              ) : (
                <span className="text-xs text-destructive">
                  not reachable
                  {proxy.caddyMessage ? ` — ${proxy.caddyMessage}` : ""}
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Cloudflare edge</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {proxy.edgeTokenConfigured
                ? "tunnel token set"
                : "no CLOUDFLARE_TUNNEL_TOKEN"}
            </div>
          </div>
        </div>
        {proxyWarn ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Proxy misconfigured</AlertTitle>
            <AlertDescription>
              Base domain is set, but Caddy is not healthy. Start with{" "}
              <code className="font-mono text-xs">pnpm infra:up</code>
              {proxy.lastReloadOk === false && proxy.lastReloadMessage
                ? ` Last reload: ${proxy.lastReloadMessage}`
                : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {proxy.lastReloadOk === true && proxy.lastReloadAt ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Last Caddy reload ok at {proxy.lastReloadAt}
          </p>
        ) : null}
      </SettingsPanel>
    </div>
  )
}

function DomainsPage() {
  const { proxy } = Route.useLoaderData()
  const needsOnboarding =
    !proxy.baseDomainConfigured || proxy.baseDomain.trim().length === 0

  return (
    <>
      <PageHeader
        title="Domains"
        description="Platform base domain and auto subdomain assignment for web services"
      />
      <CommandAction
        id="domains.save-focus"
        label="Focus domain settings"
        keywords={["base", "domain", "proxy", "caddy"]}
        icon={GlobeIcon}
        onSelect={() => {
          document.getElementById("base-domain")?.focus()
        }}
      />
      {needsOnboarding ? (
        <PageContent width="narrow">
          <Alert>
            <AlertTitle>Set a base domain to unlock public URLs</AlertTitle>
            <AlertDescription>
              Primary web services get{" "}
              <code className="font-mono text-xs">
                {"{project}.{baseDomain}"}
              </code>{" "}
              after deploy. Point a wildcard at your edge once (cloudflared →{" "}
              <code className="font-mono text-xs">{proxy.caddyOrigin}</code>
              ). Day-to-day changes live here — not in{" "}
              <code className="font-mono text-xs">DEPLOW_BASE_DOMAIN</code>.
            </AlertDescription>
          </Alert>
        </PageContent>
      ) : null}
      <PageContent width="narrow">
        <DomainsForm
          key={`${proxy.baseDomain}:${proxy.publicProtocol}:${proxy.autoDomainsEnabled}`}
          proxy={proxy}
        />
      </PageContent>
    </>
  )
}
