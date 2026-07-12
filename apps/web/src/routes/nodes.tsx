import { useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { PlusIcon, ServerIcon, ShieldIcon } from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { AppShell } from "@/components/app-shell"
import { CommandAction } from "@/components/command-action"
import { EmptyState } from "@/components/empty-state"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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

export const Route = createFileRoute("/nodes")({
  loader: async () => {
    const session = await getSession()
    if (!session) throw redirect({ to: "/login", search: { redirect: undefined } })
    const shell = await loadShellContext()
    if (!shell.instanceAdmin) throw redirect({ to: "/" })
    const nodes = await client.nodes.list()
    return { session, shell, nodes }
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

function NodesPage() {
  const { session, shell, nodes } = Route.useLoaderData()
  const [ensureOpen, setEnsureOpen] = useState(false)

  const ensureButton = (
    <Button size="sm" onClick={() => setEnsureOpen(true)}>
      <PlusIcon data-icon="inline-start" />
      Add node
    </Button>
  )

  const runtimeMissing = nodes.some(
    (n) =>
      n.provider === "docker" &&
      n.appRuntimeRequired !== false &&
      n.appRuntimeAvailable === false,
  )

  return (
    <AppShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      title="Nodes"
      description="Hosts that build and run project apps — user containers under gVisor by default"
      actions={nodes.length > 0 ? ensureButton : undefined}
    >
      <CommandAction
        id="nodes.ensure-local"
        label="Add local node"
        keywords={["register", "docker", "ensure"]}
        icon={ServerIcon}
        onSelect={() => setEnsureOpen(true)}
      />
      {runtimeMissing ? (
        <Alert variant="destructive">
          <ShieldIcon />
          <AlertTitle>gVisor runtime missing</AlertTitle>
          <AlertDescription>
            User apps require <code className="font-mono text-xs">runsc</code>{" "}
            on this host. Install gVisor, run{" "}
            <code className="font-mono text-xs">sudo runsc install</code>,
            restart Docker, then redeploy. See README / docs (secure runtime).
            Temporary escape hatch:{" "}
            <code className="font-mono text-xs">DEPLOW_APP_RUNTIME=runc</code>.
          </AlertDescription>
        </Alert>
      ) : null}

      {nodes.length === 0 ? (
        <div className="surface-panel surface-glow overflow-hidden">
          <EmptyState
            icon={ServerIcon}
            title="No nodes yet"
            description="Register this machine so projects can build images and run sandboxed app containers (gVisor by default)."
            action={
              <Button onClick={() => setEnsureOpen(true)}>
                <ServerIcon data-icon="inline-start" />
                Add local node
              </Button>
            }
          />
        </div>
      ) : (
        <div className="surface-panel overflow-hidden">
          <div className="border-b border-border/60 px-5 py-4">
            <h2 className="text-sm font-semibold tracking-tight">
              Registered nodes
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Single local Docker Engine host in this release. User apps use the
              configured OCI runtime (default <code>runsc</code> / gVisor);
              platform services stay on runc.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>App runtime</TableHead>
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
                    {node.host}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm">
                        {runtimeLabel(node.appRuntime)}
                      </span>
                      {node.appRuntime && node.appRuntimeAvailable === false ? (
                        <span className="text-xs text-destructive">
                          not installed on daemon
                        </span>
                      ) : node.appRuntime &&
                        node.appRuntimeAvailable === true ? (
                        <span className="text-xs text-muted-foreground">
                          available
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={node.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EnsureNodeDialog open={ensureOpen} onOpenChange={setEnsureOpen} />
    </AppShell>
  )
}
