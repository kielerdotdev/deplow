import { useEffect, useState, type ReactNode } from "react"
import { Link, useRouter } from "@tanstack/react-router"
import type {
  NetbirdDomainMode,
  NetbirdEdgeStatus,
  NetbirdManagedDomain,
} from "@hostrig/shared"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { client } from "@/lib/orpc"
import { cn } from "@/lib/utils"

function Step({
  done,
  active,
  label,
  children,
}: {
  done: boolean
  active: boolean
  label: string
  children?: ReactNode
}) {
  return (
    <li className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-full text-[10px]",
            done
              ? "bg-success/15 text-success"
              : active
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground",
          )}
          aria-hidden
        >
          {done ? "✓" : "•"}
        </span>
        {label}
      </div>
      {children ? <div className="pl-7">{children}</div> : null}
    </li>
  )
}

export function NetbirdEdgeWizard({
  initial,
}: {
  initial: NetbirdEdgeStatus
}) {
  const router = useRouter()
  const [status, setStatus] = useState(initial)
  const [managementUrl, setManagementUrl] = useState(initial.managementUrl)
  const [pat, setPat] = useState("")
  const [domainMode, setDomainMode] = useState<NetbirdDomainMode>(
    initial.domainMode,
  )
  const [baseDomain, setBaseDomain] = useState(initial.baseDomain)
  const [domains, setDomains] = useState<NetbirdManagedDomain[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dnsHint, setDnsHint] = useState<string | null>(initial.dnsHint)

  const connected = status.status === "connected"
  const connecting = status.status === "connecting" || pending

  useEffect(() => {
    if (status.status !== "connecting") return
    const id = setInterval(() => {
      void client.edge.netbirdStatus().then(setStatus).catch(() => {})
    }, 3000)
    return () => clearInterval(id)
  }, [status.status])

  async function refreshDomains() {
    setError(null)
    setPending(true)
    try {
      const list = await client.edge.netbirdListManagedDomains({
        managementUrl,
        pat,
      })
      setDomains(list)
      if (domainMode === "managed" && list[0] && !baseDomain) {
        setBaseDomain(list[0].domain)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function connect() {
    setError(null)
    setPending(true)
    try {
      const result = await client.edge.netbirdConnect({
        managementUrl,
        pat,
        domainMode,
        baseDomain: baseDomain || undefined,
      })
      setDnsHint(result.dnsHint ?? null)
      setBaseDomain(result.baseDomain)
      const next = await client.edge.netbirdStatus()
      setStatus(next)
      setPat("")
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      const next = await client.edge.netbirdStatus().catch(() => null)
      if (next) setStatus(next)
    } finally {
      setPending(false)
    }
  }

  async function disconnect() {
    setError(null)
    setPending(true)
    try {
      await client.edge.netbirdDisconnect()
      const next = await client.edge.netbirdStatus()
      setStatus(next)
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      {!status.clusterReady ? (
        <Alert variant={connected ? "destructive" : "default"}>
          <AlertTitle>
            {connected
              ? "Cluster offline — NetBird cannot publish"
              : "Connect a cluster first"}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {connected
              ? "NetBird is still configured, but apps need a healthy k3s cluster with Traefik. Fix or reconnect the cluster, then deploy again."
              : "NetBird installs an agent on your k3s nodes and publishes apps via Reverse Proxy."}
            <Button
              size="sm"
              variant="outline"
              render={<Link to="/settings/cluster" />}
            >
              Open Cluster
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {status.clusterReady && !status.traefikReady ? (
        <Alert>
          <AlertTitle>Traefik not detected</AlertTitle>
          <AlertDescription>
            Fix Traefik on the cluster before connecting NetBird. The agent
            targets Traefik on loopback :80 on each node.
          </AlertDescription>
        </Alert>
      ) : null}

      <ol className="space-y-4">
        <Step
          done={status.clusterReady && status.traefikReady}
          active={!status.clusterReady || !status.traefikReady}
          label="Prerequisites"
        >
          <p className="text-xs text-muted-foreground">
            Cluster {status.clusterReady ? "connected" : "missing"} · Traefik{" "}
            {status.traefikReady ? "detected" : "missing"}
          </p>
        </Step>

        <Step
          done={connected || status.hasPat}
          active={!connected}
          label="NetBird API access"
        >
          {connected ? (
            <p className="text-xs text-muted-foreground">
              Connected to{" "}
              <code className="font-mono">{status.managementUrl}</code>
              {status.peerName ? (
                <>
                  {" "}
                  · peer{" "}
                  <code className="font-mono">{status.peerName}</code>
                  {status.peerConnected === false
                    ? " (offline)"
                    : status.peerConnected
                      ? " (online)"
                      : ""}
                </>
              ) : null}
            </p>
          ) : (
            <div className="grid max-w-xl gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nb-mgmt">Management URL</Label>
                <Input
                  id="nb-mgmt"
                  className="font-mono text-sm"
                  value={managementUrl}
                  onChange={(e) => setManagementUrl(e.target.value)}
                  placeholder="https://api.netbird.io"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Cloud default, or your self-hosted URL (e.g.{" "}
                  <code className="font-mono">https://netbird.example.com</code>
                  ).
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nb-pat">Personal Access Token</Label>
                <Input
                  id="nb-pat"
                  type="password"
                  className="font-mono text-sm"
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                  placeholder="Paste PAT from NetBird → Settings → Personal Access Tokens"
                  autoComplete="off"
                />
              </div>
            </div>
          )}
        </Step>

        <Step
          done={connected && Boolean(status.baseDomain)}
          active={!connected && Boolean(pat)}
          label="Public base domain"
        >
          {connected ? (
            <p className="text-xs text-muted-foreground">
              Apps publish as{" "}
              <code className="font-mono">
                {"{slug}."}
                {status.baseDomain}
              </code>
              . NetBird Reverse Proxy services are created automatically on
              deploy.
            </p>
          ) : (
            <div className="grid max-w-xl gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nb-domain-mode">Domain source</Label>
                <select
                  id="nb-domain-mode"
                  className="flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={domainMode}
                  onChange={(e) =>
                    setDomainMode(e.target.value as NetbirdDomainMode)
                  }
                >
                  <option value="managed">
                    NetBird-managed (recommended — no DNS)
                  </option>
                  <option value="custom">Custom domain (you add DNS)</option>
                </select>
              </div>
              {domainMode === "managed" ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending || pat.length < 8}
                      onClick={() => void refreshDomains()}
                    >
                      {pending ? "Loading…" : "Load domains"}
                    </Button>
                  </div>
                  {domains.length > 0 ? (
                    <select
                      className="flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 py-1 font-mono text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={baseDomain}
                      onChange={(e) => setBaseDomain(e.target.value)}
                    >
                      {domains.map((d) => (
                        <option key={d.id} value={d.domain}>
                          {d.domain} ({d.type})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      className="font-mono text-sm"
                      placeholder="Or paste a managed base domain"
                      value={baseDomain}
                      onChange={(e) => setBaseDomain(e.target.value)}
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="nb-custom-domain">Base domain</Label>
                  <Input
                    id="nb-custom-domain"
                    className="font-mono text-sm"
                    placeholder="apps.example.com"
                    value={baseDomain}
                    onChange={(e) => setBaseDomain(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
        </Step>

        <Step
          done={connected && status.clusterReady && status.traefikReady}
          active={!connected && status.clusterReady}
          label="Connect"
        >
          {connected ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {status.clusterReady && status.traefikReady
                  ? "Edge ready. Deploy a web service to publish via NetBird."
                  : "Credentials saved. Waiting on cluster + Traefik before apps can go public."}
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void disconnect()}
              >
                Disconnect NetBird
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              disabled={
                pending ||
                !status.clusterReady ||
                !status.traefikReady ||
                pat.length < 8 ||
                (domainMode === "custom" && !baseDomain.trim())
              }
              onClick={() => void connect()}
            >
              {connecting ? "Connecting…" : "Connect NetBird"}
            </Button>
          )}
          {status.status === "connecting" && status.statusMessage ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {status.statusMessage}
            </p>
          ) : null}
          {status.status === "error" && status.statusMessage ? (
            <p className="mt-2 text-xs text-destructive">
              {status.statusMessage}
            </p>
          ) : null}
        </Step>
      </ol>

      {dnsHint || status.dnsHint ? (
        <Alert>
          <AlertTitle>DNS required</AlertTitle>
          <AlertDescription>{dnsHint || status.dnsHint}</AlertDescription>
        </Alert>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
