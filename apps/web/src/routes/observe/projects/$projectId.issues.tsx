import { useMemo, useState } from "react"
import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router"
import { z } from "zod"

import { ObserveProjectShell } from "@/components/observe"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getSession } from "@/lib/auth.functions"
import { parseContext, serializeContext } from "@/lib/observe/context"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"
import { formatRelativeTime } from "@/lib/ui-format"
import { cn } from "@/lib/utils"

const issueStatusSchema = z.enum(["unresolved", "resolved", "muted"])

export const Route = createFileRoute("/observe/projects/$projectId/issues")({
  validateSearch: (search) => {
    const ctx = serializeContext(parseContext(search))
    const status = issueStatusSchema.catch("unresolved").parse(search.status)
    return { ...ctx, status }
  },
  loader: async ({ params, location }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    const shell = await loadShellContext()
    const status = await client.observe.status().catch(() => null)
    await client.observe.projects.enable({ projectId: params.projectId }).catch(
      () => null,
    )
    const issueStatus =
      issueStatusSchema.catch("unresolved").parse(
        (location.search as { status?: string }).status,
      )
    const issues = await client.observe.issues
      .list({ projectId: params.projectId, status: issueStatus })
      .catch(() => [])
    const project = await client.projects.get({ id: params.projectId })
    return { session, shell, status, issues, project, issueStatus }
  },
  component: IssuesPage,
})

const TABS = [
  { id: "unresolved" as const, label: "Unresolved" },
  { id: "resolved" as const, label: "Resolved" },
  { id: "muted" as const, label: "Ignored" },
]

function IssuesPage() {
  const { session, shell, status, issues, project, issueStatus } =
    Route.useLoaderData()
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const context = parseContext(search)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const allSelected = useMemo(
    () => issues.length > 0 && selected.size === issues.length,
    [issues, selected],
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function bulk(status: "resolved" | "muted" | "unresolved") {
    const ids = [...selected]
    if (ids.length === 0) return
    await client.observe.issues.bulkUpdateStatus({
      projectId,
      issueIds: ids,
      status,
    })
    setSelected(new Set())
    await router.invalidate()
  }

  return (
    <ObserveProjectShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      observeEnabled={status?.enabled === true}
      projectId={projectId}
      title={`Issues · ${project.name}`}
      description="Errors grouped by fingerprint (deplow-v1)."
      context={context}
      onContextChange={(next) =>
        void navigate({
          search: { ...serializeContext(next), status: issueStatus },
          replace: true,
        })
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={issueStatus === t.id ? "default" : "outline"}
            onClick={() =>
              void navigate({
                search: { ...serializeContext(context), status: t.id },
              })
            }
          >
            {t.label}
          </Button>
        ))}
        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={selected.size === 0}
            onClick={() => void bulk("resolved")}
          >
            Resolve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selected.size === 0}
            onClick={() => void bulk("muted")}
          >
            Ignore
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={selected.size === 0}
            onClick={() => void bulk("unresolved")}
          >
            Reopen
          </Button>
        </div>
      </div>

      {issues.length === 0 ? (
        <div className="surface-panel">
          <p className="px-5 py-10 text-sm text-muted-foreground">
            No {issueStatus === "muted" ? "ignored" : issueStatus} issues.
          </p>
        </div>
      ) : (
        <div className="surface-panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="data-table-head data-table-cell w-10 pl-5">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => {
                      if (v) setSelected(new Set(issues.map((i) => i.id)))
                      else setSelected(new Set())
                    }}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead className="data-table-head data-table-cell">
                  Issue
                </TableHead>
                <TableHead className="data-table-head data-table-cell w-24">
                  Count
                </TableHead>
                <TableHead className="data-table-head data-table-cell w-32 pr-5">
                  Last seen
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map((issue) => (
                <TableRow
                  key={issue.id}
                  className={cn(
                    "data-table-row",
                    selected.has(issue.id) && "bg-muted/40",
                  )}
                >
                  <TableCell className="data-table-cell pl-5">
                    <Checkbox
                      checked={selected.has(issue.id)}
                      onCheckedChange={() => toggle(issue.id)}
                      aria-label={`Select ${issue.title}`}
                    />
                  </TableCell>
                  <TableCell className="data-table-cell whitespace-normal">
                    <Link
                      to="/observe/projects/$projectId/issues/$issueId"
                      params={{ projectId, issueId: issue.id }}
                      search={serializeContext(context)}
                      className="font-medium hover:underline"
                    >
                      {issue.title}
                    </Link>
                    {issue.culprit ? (
                      <div className="text-xs text-muted-foreground">
                        {issue.culprit}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="data-table-cell">{issue.count}</TableCell>
                  <TableCell className="data-table-cell pr-5 text-muted-foreground">
                    {formatRelativeTime(issue.lastSeen)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </ObserveProjectShell>
  )
}
