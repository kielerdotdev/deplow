import { useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { ServerIcon } from "lucide-react"

import { AppShell } from "@/components/app-shell"
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

  return (
    <AppShell
      user={session.user}
      title="Nodes"
      description="Docker hosts that run your project containers"
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
          <CardTitle>Registered nodes</CardTitle>
          <CardDescription>
            This release uses a single local Docker socket. Multi-server SSH is
            out of scope.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {nodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No nodes yet. Register the local Docker node before deploying.
            </p>
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
                      {node.provider}
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
        </CardContent>
      </Card>
    </AppShell>
  )
}
