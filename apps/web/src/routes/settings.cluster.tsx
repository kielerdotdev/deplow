import { useEffect, useState } from "react"
import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router"
import {
  CloudIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  ServerIcon,
  TrashIcon,
} from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { SettingsPage, SettingsPanel } from "@/components/page-layout"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getSession } from "@/lib/auth.functions"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

export const Route = createFileRoute("/settings/cluster")({
  loader: async () => {
    const session = await getSession()
    if (!session)
      throw redirect({ to: "/login", search: { redirect: undefined } })
    const shell = await loadShellContext()
    if (!shell.instanceAdmin) throw redirect({ to: "/" })
    const cluster = await client.cluster.get()
    return { session, shell, cluster }
  },
  component: ClusterPage,
})

function formatElapsed(startedAt: string | null | undefined): string | null {
  if (!startedAt) return null
  const t = Date.parse(startedAt)
  if (Number.isNaN(t)) return null
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  return `${Math.floor(min / 60)}h ${min % 60}m`
}

function operationTitle(kind: string | undefined): string {
  switch (kind) {
    case "create":
      return "Creating cluster"
    case "scale_up":
      return "Adding worker"
    case "scale_down":
      return "Removing worker"
    case "reconcile":
      return "Updating cluster"
    default:
      return "Cluster operation in progress"
  }
}

function ClusterPage() {
  const { cluster } = Route.useLoaderData()
  const router = useRouter()
  const [kubeconfig, setKubeconfig] = useState("")
  const [nodeToken, setNodeToken] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [storedKubeconfig, setStoredKubeconfig] = useState<string | null>(null)
  const [showKubeconfig, setShowKubeconfig] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedJoin, setCopiedJoin] = useState(false)
  const [removingNode, setRemovingNode] = useState<string | null>(null)
  const [joinScript, setJoinScript] = useState<string | null>(null)
  const [joinServerUrl, setJoinServerUrl] = useState<string | null>(null)

  const busy = Boolean(cluster.operation?.busy)
  const provisioning = cluster.status === "provisioning" || busy
  const attached = cluster.status !== "disconnected"
  const hasLiveApi =
    cluster.nodeCount > 0 ||
    Boolean(cluster.serverUrl) ||
    cluster.status === "connected"
  const showConnectForms = !attached
  const showClusterDetail = attached && (hasLiveApi || provisioning)

  useEffect(() => {
    if (!provisioning) return
    const id = window.setInterval(() => {
      void router.invalidate()
    }, 5000)
    return () => window.clearInterval(id)
  }, [provisioning, router])

  async function refresh() {
    await router.invalidate()
  }

  async function connect() {
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      await client.cluster.connect({
        kubeconfig,
        name: name.trim() || undefined,
        nodeToken: nodeToken.trim() || undefined,
      })
      setKubeconfig("")
      setNodeToken("")
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function disconnect() {
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      await client.cluster.disconnect()
      setStoredKubeconfig(null)
      setShowKubeconfig(false)
      setJoinScript(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function createHetzner() {
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      await client.cluster.createHetzner({
        name: name.trim() || undefined,
      })
      setNotice(
        "Cluster create started. Waiting for the VM to install k3s + gVisor and post kubeconfig…",
      )
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function addNode() {
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      const res = await client.cluster.addNode({
        name: name.trim() || undefined,
      })
      const msg =
        "message" in res && typeof res.message === "string"
          ? res.message
          : "Hetzner worker spawn started. The VM installs gVisor and joins k3s — usually a few minutes."
      setNotice(msg)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function removeNode(nodeName: string) {
    if (
      !window.confirm(
        `Remove worker node "${nodeName}"? This destroys the cloud VM when managed by Hostrig.`,
      )
    ) {
      return
    }
    setRemovingNode(nodeName)
    setError(null)
    setNotice(null)
    try {
      const res = await client.cluster.removeNode({ nodeName })
      const msg =
        "message" in res && typeof res.message === "string"
          ? res.message
          : `Removing worker "${nodeName}"…`
      setNotice(msg)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRemovingNode(null)
    }
  }

  async function loadKubeconfig() {
    setPending(true)
    setError(null)
    try {
      const res = await client.cluster.getKubeconfig()
      setStoredKubeconfig(res.kubeconfig)
      setShowKubeconfig(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function copyKubeconfig() {
    if (!storedKubeconfig) return
    try {
      await navigator.clipboard.writeText(storedKubeconfig)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("Could not copy to clipboard")
    }
  }

  async function loadJoinScript() {
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      const res = await client.cluster.getWorkerJoinScript({
        nodeName: name.trim() || undefined,
      })
      setJoinScript(res.script)
      setJoinServerUrl(res.serverUrl)
      setNotice(
        `Join script ready for node "${res.nodeName}". Run as root on the new machine.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function copyJoinScript() {
    if (!joinScript) return
    try {
      await navigator.clipboard.writeText(joinScript)
      setCopiedJoin(true)
      window.setTimeout(() => setCopiedJoin(false), 2000)
    } catch {
      setError("Could not copy to clipboard")
    }
  }

  async function storeJoinToken() {
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      await client.cluster.storeJoinToken({ nodeToken: nodeToken.trim() })
      setNodeToken("")
      setNotice("Join token stored. You can generate a self-hosted worker script.")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  const canDisconnect = cluster.status !== "disconnected"
  const managed = cluster.managed
  const canAddNode =
    managed.canAddNode && cluster.hetznerConfigured && !provisioning && !pending
  const canViewKubeconfig =
    (hasLiveApi || cluster.status === "error") && managed.canViewKubeconfig
  const elapsed = formatElapsed(cluster.operation?.startedAt)
  const actionsBlocked = pending || provisioning

  return (
    <SettingsPage
      title="Cluster"
      description="Connect an existing k3s cluster or create one on Hetzner. Grow capacity with Hetzner or self-hosted workers. User apps run under gVisor."
      width="wide"
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Cluster action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {notice && !error ? (
        <Alert>
          <AlertTitle>In progress</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {provisioning ? (
        <Alert>
          <AlertTitle className="flex flex-wrap items-center gap-2">
            <Loader2Icon className="size-4 animate-spin" />
            {operationTitle(cluster.operation?.kind)}
          </AlertTitle>
          <AlertDescription className="space-y-1">
            <p>
              {cluster.operation?.message ??
                "Waiting for the node to finish bootstrap and POST kubeconfig."}
            </p>
            <p className="text-xs text-muted-foreground">
              {elapsed ? `Started ${elapsed} ago. ` : null}
              This page refreshes every 5 seconds.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <SettingsPanel
        title="Status"
        description="One cluster per Hostrig instance. Traefik serves Ingress hosts; user apps use RuntimeClass gvisor."
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd className="mt-1">
              <StatusBadge status={cluster.status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Source</dt>
            <dd className="mt-1 font-mono text-xs">
              {cluster.source ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">API</dt>
            <dd className="mt-1 break-all font-mono text-xs">
              {cluster.serverUrl ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">External IP</dt>
            <dd className="mt-1 font-mono text-xs">
              {cluster.externalIp ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Nodes</dt>
            <dd className="mt-1">
              {cluster.readyNodeCount}/{cluster.nodeCount} ready
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Traefik</dt>
            <dd className="mt-1">
              {cluster.traefikReady ? "Detected" : "Not detected"}
            </dd>
          </div>
        </dl>
        {cluster.errorMessage ? (
          <p className="mt-3 text-sm text-destructive">{cluster.errorMessage}</p>
        ) : null}
        {canDisconnect ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void disconnect()}
            >
              <TrashIcon data-icon="inline-start" />
              Disconnect
            </Button>
            {hasLiveApi ? (
              <Button
                size="sm"
                variant="outline"
                render={<Link to="/settings/networking" />}
              >
                Domains & edge
              </Button>
            ) : null}
          </div>
        ) : null}
      </SettingsPanel>

      {canViewKubeconfig ? (
        <SettingsPanel
          title="Kubeconfig"
          description="Admin-only. Download or copy the stored cluster credentials for kubectl and tooling."
        >
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void loadKubeconfig()}
            >
              {showKubeconfig && storedKubeconfig ? (
                <EyeOffIcon data-icon="inline-start" />
              ) : (
                <EyeIcon data-icon="inline-start" />
              )}
              {showKubeconfig && storedKubeconfig
                ? "Refresh kubeconfig"
                : "Reveal kubeconfig"}
            </Button>
            {storedKubeconfig ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void copyKubeconfig()}
              >
                <CopyIcon data-icon="inline-start" />
                {copied ? "Copied" : "Copy"}
              </Button>
            ) : null}
            {storedKubeconfig ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowKubeconfig((v) => !v)
                }}
              >
                {showKubeconfig ? "Hide" : "Show"}
              </Button>
            ) : null}
          </div>
          {showKubeconfig && storedKubeconfig ? (
            <textarea
              readOnly
              className="mt-3 min-h-48 w-full rounded-md border border-input bg-muted/30 px-3 py-2 font-mono text-xs"
              value={storedKubeconfig}
              aria-label="Stored kubeconfig"
            />
          ) : null}
        </SettingsPanel>
      ) : null}

      {showConnectForms ? (
        <>
          <SettingsPanel
            title="Connect kubeconfig"
            description="Paste a kubeconfig that can reach the cluster API. Optional: store the k3s node-token so you can add self-hosted workers later."
          >
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cluster-name">Name (optional)</Label>
                <Input
                  id="cluster-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="prod"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kubeconfig">Kubeconfig</Label>
                <textarea
                  id="kubeconfig"
                  className="min-h-40 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs"
                  value={kubeconfig}
                  onChange={(e) => setKubeconfig(e.target.value)}
                  placeholder="apiVersion: v1&#10;kind: Config&#10;..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="node-token">
                  k3s node-token (optional, for self-hosted workers)
                </Label>
                <Input
                  id="node-token"
                  value={nodeToken}
                  onChange={(e) => setNodeToken(e.target.value)}
                  placeholder="K10…::server:…"
                  className="font-mono text-xs"
                />
              </div>
              <Button
                size="sm"
                disabled={pending || kubeconfig.trim().length < 32}
                onClick={() => void connect()}
              >
                {pending ? "Connecting…" : "Connect cluster"}
              </Button>
            </div>
          </SettingsPanel>

          {cluster.hetznerConfigured ? (
            <SettingsPanel
              title="Create on Hetzner"
              description="Spawns a VM, installs k3s server + gVisor via cloud-init, and POSTs kubeconfig back. Add Hetzner or self-hosted workers after connect."
            >
              <Button
                size="sm"
                disabled={actionsBlocked}
                onClick={() => void createHetzner()}
              >
                <CloudIcon data-icon="inline-start" />
                {pending ? "Creating…" : "Create k3s cluster"}
              </Button>
            </SettingsPanel>
          ) : (
            <Alert>
              <AlertTitle>Hetzner not configured</AlertTitle>
              <AlertDescription>
                Set <code className="font-mono text-xs">HOSTRIG_HETZNER_API_TOKEN</code>{" "}
                to create clusters and add Hetzner workers from the UI.
              </AlertDescription>
            </Alert>
          )}
        </>
      ) : null}

      {showClusterDetail ? (
        <>
          {cluster.nodes.length === 0 ? (
            <SettingsPanel title="Nodes">
              <EmptyState
                variant="compact"
                icon={ServerIcon}
                title={
                  provisioning
                    ? "Waiting for nodes…"
                    : cluster.status === "error"
                      ? "Cluster not reachable"
                      : "No nodes reported"
                }
                description={
                  provisioning
                    ? "The API may come up before workers finish joining. This list refreshes automatically."
                    : cluster.status === "error"
                      ? "Fix the connection error above, then nodes will appear here."
                      : "The API is reachable but no nodes were listed yet."
                }
              />
            </SettingsPanel>
          ) : (
            <SettingsPanel
              title="Nodes"
              description={
                managed.canAddNode
                  ? "Ready workers schedule app pods. Add a Hetzner worker or a self-hosted worker below."
                  : "Ready nodes schedule app pods. Use the self-hosted join script to add capacity on BYO clusters."
              }
              flush
              action={
                canAddNode ? (
                  <Button
                    size="sm"
                    disabled={actionsBlocked}
                    onClick={() => void addNode()}
                  >
                    {pending ? (
                      <>
                        <Loader2Icon
                          className="size-3.5 animate-spin"
                          data-icon="inline-start"
                        />
                        Starting…
                      </>
                    ) : (
                      "Add Hetzner worker"
                    )}
                  </Button>
                ) : undefined
              }
            >
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Status</TableHead>
                    {managed.canRemoveNode ? (
                      <TableHead className="w-[100px]">Actions</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cluster.nodes.map((n) => (
                    <TableRow key={n.name}>
                      <TableCell className="font-medium">{n.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {n.roles.join(", ")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {n.externalIp || n.internalIp || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {n.capacityCpu ?? "—"} cpu · {n.capacityMemory ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={n.ready ? "ready" : "offline"} />
                      </TableCell>
                      {managed.canRemoveNode ? (
                        <TableCell>
                          {n.removable ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={
                                actionsBlocked || removingNode === n.name
                              }
                              onClick={() => void removeNode(n.name)}
                            >
                              {removingNode === n.name ? "…" : "Remove"}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SettingsPanel>
          )}

          <SettingsPanel
            title="Add self-hosted worker"
            description="Installs gVisor then joins k3s as an agent. Run the script as root on the new machine. Requires a stored node-token (automatic for Hetzner create; paste for BYO)."
          >
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={actionsBlocked}
                onClick={() => void loadJoinScript()}
              >
                {pending ? "Generating…" : "Generate join script"}
              </Button>
              {joinScript ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void copyJoinScript()}
                >
                  <CopyIcon data-icon="inline-start" />
                  {copiedJoin ? "Copied" : "Copy script"}
                </Button>
              ) : null}
            </div>
            {joinServerUrl ? (
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                Server: {joinServerUrl}
              </p>
            ) : null}
            {joinScript ? (
              <textarea
                readOnly
                className="mt-3 min-h-48 w-full rounded-md border border-input bg-muted/30 px-3 py-2 font-mono text-xs"
                value={joinScript}
                aria-label="Self-hosted worker join script"
              />
            ) : null}

            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <Label htmlFor="store-token">Store / update join token (BYO)</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="store-token"
                  value={nodeToken}
                  onChange={(e) => setNodeToken(e.target.value)}
                  placeholder="K10…::server:… from /var/lib/rancher/k3s/server/node-token"
                  className="max-w-xl font-mono text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || nodeToken.trim().length < 8}
                  onClick={() => void storeJoinToken()}
                >
                  Store token
                </Button>
              </div>
            </div>
          </SettingsPanel>
        </>
      ) : null}
    </SettingsPage>
  )
}
