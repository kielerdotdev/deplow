import { useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { CopyIcon, PlusIcon, ServerIcon, ShieldIcon } from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { CommandAction } from "@/components/command-action"
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

export const Route = createFileRoute("/settings/nodes")({
  loader: async () => {
    const session = await getSession()
    if (!session) throw redirect({ to: "/login", search: { redirect: undefined } })
    const shell = await loadShellContext()
    if (!shell.instanceAdmin) throw redirect({ to: "/" })
    const [nodes, joinTokens] = await Promise.all([
      client.nodes.list(),
      client.nodes.listJoinTokens(),
    ])
    return { session, shell, nodes, joinTokens }
  },
  component: NodesPage,
})

function runtimeLabel(runtime?: string) {
  if (!runtime) return "—"
  if (runtime === "runsc" || runtime.startsWith("runsc")) {
    return `gVisor (${runtime})`
  }
  if (runtime === "runc") return "runc (not sandboxed)"
  return runtime
}

function EnsureNodeDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!open) return null
  return <EnsureNodeDialogBody onOpenChange={onOpenChange} />
}

function EnsureNodeDialogBody({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ensureLocalNode() {
    setPending(true)
    setError(null)
    try {
      await client.nodes.ensureLocal()
      onOpenChange(false)
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPending(false)
    }
  }

  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      title="Add local node"
      description="Registers this machine’s Docker Engine for builds (runc) and user app deploys (gVisor / runsc by default)."
      icon={ServerIcon}
      footer={
        <>
          <Button disabled={pending} onClick={() => void ensureLocalNode()}>
            <ServerIcon data-icon="inline-start" />
            {pending ? "Registering…" : "Register node"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not register node</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <p className="text-sm text-muted-foreground">
          Uses the local Docker daemon socket. You typically need this once
          before the first deploy. Install gVisor so deploys can use{" "}
          <code className="font-mono text-xs">runsc</code>.
        </p>
      )}
    </ActionDialog>
  )
}

function AddRemoteDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!open) return null
  return <AddRemoteDialogBody onOpenChange={onOpenChange} />
}

function AddRemoteDialogBody({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState("")
  const [installCommand, setInstallCommand] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function createToken() {
    setPending(true)
    setError(null)
    try {
      const result = await client.nodes.createJoinToken({
        label: label.trim() || undefined,
        ttlSeconds: 3600,
      })
      setInstallCommand(result.installCommand)
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  async function copyCommand() {
    if (!installCommand) return
    await navigator.clipboard.writeText(installCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      title="Add remote node"
      description="Generate a one-time join token and install the agent on another host."
      icon={ServerIcon}
      footer={
        installCommand ? (
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        ) : (
          <>
            <Button disabled={pending} onClick={() => void createToken()}>
              {pending ? "Creating…" : "Create join token"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </>
        )
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not create token</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {installCommand ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Run this on the remote host (token expires in 1 hour, single use):
          </p>
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">
            {installCommand}
          </pre>
          <Button size="sm" variant="outline" onClick={() => void copyCommand()}>
            <CopyIcon data-icon="inline-start" />
            {copied ? "Copied" : "Copy command"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="join-label">Label (optional)</Label>
            <Input
              id="join-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="prod-edge-1"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            The agent joins over HTTPS, heartbeats, and runs builds/deploys on
            that host’s Docker. Pin projects to the node after it appears online.
          </p>
        </div>
      )}
    </ActionDialog>
  )
}

function NodesPage() {
  const { nodes, joinTokens } = Route.useLoaderData()
  const [ensureOpen, setEnsureOpen] = useState(false)
  const [remoteOpen, setRemoteOpen] = useState(false)

  const actions = (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => setRemoteOpen(true)}>
        <PlusIcon data-icon="inline-start" />
        Add remote node
      </Button>
      <Button size="sm" variant="outline" onClick={() => setEnsureOpen(true)}>
        <ServerIcon data-icon="inline-start" />
        Add local node
      </Button>
    </div>
  )

  const runtimeMissing = nodes.some(
    (n) =>
      n.provider === "docker" &&
      n.appRuntimeRequired !== false &&
      n.appRuntimeAvailable === false,
  )

  const pendingTokens = joinTokens.filter((t) => !t.redeemedAt && !t.expired)

  return (
    <>
      <SettingsPage
        title="Nodes"
        description="Hosts that build and run project apps — local Docker or remote agents"
        actions={actions}
        width="wide"
      >
        <CommandAction
          id="nodes.ensure-local"
          label="Add local node"
          keywords={["register", "docker", "ensure"]}
          icon={ServerIcon}
          onSelect={() => setEnsureOpen(true)}
        />
        <CommandAction
          id="nodes.add-remote"
          label="Add remote node"
          keywords={["agent", "join", "token", "remote"]}
          icon={ServerIcon}
          onSelect={() => setRemoteOpen(true)}
        />
        {runtimeMissing ? (
          <Alert variant="destructive">
            <ShieldIcon />
            <AlertTitle>gVisor runtime missing</AlertTitle>
            <AlertDescription>
              User apps require <code className="font-mono text-xs">runsc</code>{" "}
              on this host. Install gVisor, run{" "}
              <code className="font-mono text-xs">sudo runsc install</code>,
              restart Docker, then redeploy.
            </AlertDescription>
          </Alert>
        ) : null}

        {nodes.length === 0 ? (
          <SettingsPanel
            title="Nodes"
            description="Register a local Docker host or join a remote agent."
          >
            <EmptyState
              variant="compact"
              icon={ServerIcon}
              title="No nodes yet"
              description="Add a local Docker node or generate a join token for a remote agent."
              action={actions}
            />
          </SettingsPanel>
        ) : (
          <SettingsPanel
            title="Registered nodes"
            description="Local docker nodes run in-process. Agent nodes pull jobs and advertise a host:port for the proxy."
            flush
          >
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Runtime / version</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodes.map((node) => (
                  <TableRow key={node.id}>
                    <TableCell className="font-medium">{node.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {node.provider}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {node.advertiseHost || node.host}
                    </TableCell>
                    <TableCell>
                      {node.provider === "agent" ? (
                        <span className="text-sm text-muted-foreground">
                          {node.agentVersion
                            ? `agent v${node.agentVersion}`
                            : "agent"}
                        </span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm">
                            {runtimeLabel(node.appRuntime)}
                          </span>
                          {node.appRuntime &&
                          node.appRuntimeAvailable === false ? (
                            <span className="text-xs text-destructive">
                              not installed on daemon
                            </span>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={node.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SettingsPanel>
        )}

        {pendingTokens.length > 0 ? (
          <SettingsPanel
            title="Pending join tokens"
            description="Unused tokens waiting for an agent to redeem."
            flush
          >
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Prefix</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingTokens.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.prefix}…</TableCell>
                    <TableCell>{t.label || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(t.expiresAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SettingsPanel>
        ) : null}
      </SettingsPage>

      <EnsureNodeDialog open={ensureOpen} onOpenChange={setEnsureOpen} />
      <AddRemoteDialog open={remoteOpen} onOpenChange={setRemoteOpen} />
    </>
  )
}
