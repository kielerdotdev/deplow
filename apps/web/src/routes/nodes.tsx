import { useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { ServerIcon } from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { AppShell } from "@/components/app-shell"
import { EmptyState } from "@/components/empty-state"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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

/**
 * Host health page — not the happy path.
 * v1 is a single local Docker node; multi-host SSH/Hetzner is out of scope.
 */
export const Route = createFileRoute("/nodes")({
  loader: async () => {
    const session = await getSession()
    if (!session) throw redirect({ to: "/login" })
    const nodes = await client.nodes.list()
    return { session, nodes }
  },
  component: NodesPage,
})

function NodesPage() {
  const { session, nodes } = Route.useLoaderData()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  async function ensureLocalNode() {
    setPending(true)
    setError(null)
    try {
      await client.nodes.ensureLocal()
      await router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  const local = nodes.find((n) => n.name === "local" || n.provider === "docker")

  return (
    <AppShell
      user={session.user}
      title="Nodes"
      description="Local Docker host health (not multi-server placement)"
      actions={
        <Button size="sm" disabled={pending} onClick={ensureLocalNode}>
          <ServerIcon data-icon="inline-start" />
          {pending ? "Working…" : "Ensure local Docker node"}
        </Button>
      }
    >
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Host</CardTitle>
          <CardDescription>
            This release pins every project to a single local Docker socket. SSH
            and Hetzner multi-host placement are out of scope for v1 — use{" "}
            <code className="text-xs">pnpm doctor</code> for preflight checks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {nodes.length === 0 ? (
            <EmptyState
              icon={ServerIcon}
              title="No local node registered"
              description="Register the local Docker node before deploying. This is automatic on project create."
              action={
                <Button size="sm" disabled={pending} onClick={ensureLocalNode}>
                  Ensure local Docker node
                </Button>
              }
              secondaryAction={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setHelpOpen(true)}
                >
                  Why is this here?
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodes.map((node) => (
                  <TableRow key={node.id}>
                    <TableCell className="font-medium">{node.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {node.provider === "docker"
                        ? "docker (local)"
                        : `${node.provider} (not used in v1)`}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {node.host}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={node.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {local ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Happy path: create a project and Deploy — you should not need this
              page day-to-day.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <ActionDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        title="Nodes are not the happy path"
        description="deplow v1 runs on one local Docker host. Multi-server placement is intentionally deferred."
        footer={
          <Button variant="outline" onClick={() => setHelpOpen(false)}>
            Close
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">
          Use Projects to create and deploy. This screen only shows whether the
          local Docker node is registered for operators debugging the host.
        </p>
      </ActionDialog>
    </AppShell>
  )
}
