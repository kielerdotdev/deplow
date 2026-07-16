import { useEffect, useMemo, useState } from "react"
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { z } from "zod"

import {
  DetailDrawer,
  EventInspector,
  ObserveEmptyState,
  ObserveProjectShell,
  Sparkline,
} from "@/components/observe"
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
import {
  applyColdDefaults,
  parseIssuesListSearch,
  serializeIssueSearch,
  serializeIssuesListSearch,
  serializeTraceSearch,
} from "@/lib/observe/context"
import { client } from "@/lib/orpc"
import { formatRelativeTime } from "@/lib/ui-format"
import { cn } from "@/lib/utils"

const issueStatusSchema = z.enum(["unresolved", "resolved", "muted"])

export const Route = createFileRoute("/observe/projects/$projectId/issues")({
  validateSearch: (search) => {
    const status = issueStatusSchema.catch("unresolved").parse(search.status)
    const withDefaults = applyColdDefaults(
      "issues",
      search as Record<string, unknown>,
    )
    const { context, inspect } = parseIssuesListSearch(withDefaults)
    return serializeIssuesListSearch(context, status, inspect)
  },
  loader: async ({ params, location }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    await client.observe.projects.enable({ projectId: params.projectId }).catch(
      () => null,
    )
    const issueStatus = issueStatusSchema
      .catch("unresolved")
      .parse((location.search as { status?: string }).status)
    const issues = await client.observe.issues
      .list({ projectId: params.projectId, status: issueStatus })
      .catch(() => [])
    const project = await client.projects.get({ id: params.projectId })
    return { issues, project, issueStatus }
  },
  component: IssuesPage,
})

const TABS = [
  { id: "unresolved" as const, label: "Unresolved" },
  { id: "resolved" as const, label: "Resolved" },
  { id: "muted" as const, label: "Ignored" },
]

function IssuesPage() {
  const { issues, project, issueStatus } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const { context, inspect: drawerIssueId } = parseIssuesListSearch(search)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [trends, setTrends] = useState<
    Record<string, Array<{ t: string; count: number }>>
  >({})
  const [drawerEvent, setDrawerEvent] = useState<Awaited<
    ReturnType<typeof client.observe.events.get>
  > | null>(null)
  const [drawerEventState, setDrawerEventState] = useState<
    "idle" | "loading" | "error" | "empty"
  >("idle")
  const [focusIdx, setFocusIdx] = useState(0)

  function setDrawerIssueId(id: string | null) {
    void navigate({
      search: serializeIssuesListSearch(context, issueStatus, id),
      replace: true,
    })
  }

  const filteredIssues = useMemo(() => {
    const q = (context.query.q ?? "").trim().toLowerCase()
    if (!q) return issues
    return issues.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.culprit?.toLowerCase().includes(q) ?? false) ||
        (i.level?.toLowerCase().includes(q) ?? false),
    )
  }, [issues, context.query.q])

  const allSelected = useMemo(
    () =>
      filteredIssues.length > 0 &&
      filteredIssues.every((i) => selected.has(i.id)),
    [filteredIssues, selected],
  )

  useEffect(() => {
    if (issues.length === 0) {
      setTrends({})
      return
    }
    let cancelled = false
    void client.observe.issues
      .trend({
        projectId,
        issueIds: issues.map((i) => i.id),
        hours: 24,
      })
      .then((t) => {
        if (!cancelled) setTrends(t)
      })
      .catch(() => {
        if (!cancelled) setTrends({})
      })
    return () => {
      cancelled = true
    }
  }, [projectId, issues])

  useEffect(() => {
    if (!drawerIssueId) {
      setDrawerEvent(null)
      setDrawerEventState("idle")
      return
    }
    const issue = issues.find((i) => i.id === drawerIssueId)
    const eventId = issue?.lastEventId
    if (!eventId) {
      setDrawerEvent(null)
      setDrawerEventState("empty")
      return
    }
    let cancelled = false
    setDrawerEventState("loading")
    void client.observe.events
      .get({ projectId, eventId })
      .then((e) => {
        if (!cancelled) {
          setDrawerEvent(e)
          setDrawerEventState("idle")
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDrawerEvent(null)
          setDrawerEventState("error")
        }
      })
    return () => {
      cancelled = true
    }
  }, [drawerIssueId, issues, projectId])

  useEffect(() => {
    setFocusIdx((i) => Math.min(i, Math.max(filteredIssues.length - 1, 0)))
  }, [filteredIssues.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return
      }
      if (e.key === "j") {
        e.preventDefault()
        setFocusIdx((i) =>
          Math.min(i + 1, Math.max(filteredIssues.length - 1, 0)),
        )
      } else if (e.key === "k") {
        e.preventDefault()
        setFocusIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === "x") {
        e.preventDefault()
        const id = filteredIssues[focusIdx]?.id
        if (id) toggle(id)
      } else if (e.key === "Enter") {
        e.preventDefault()
        const id = filteredIssues[focusIdx]?.id
        if (id) setDrawerIssueId(id)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [focusIdx, filteredIssues])

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
      projectId={projectId}
      title="Issues"
      description={`${project.name} · grouped by fingerprint`}
      context={context}
      onContextChange={(next) =>
        void navigate({
          search: serializeIssuesListSearch(next, issueStatus, drawerIssueId),
          replace: true,
        })
      }
      onSaveView={(name) => {
        void client.observe.savedViews.create({
          projectId,
          name,
          surface: "issues",
          contextJson: JSON.stringify(context),
        })
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={issueStatus === t.id ? "default" : "outline"}
            onClick={() =>
              void navigate({
                search: serializeIssuesListSearch(
                  context,
                  t.id,
                  drawerIssueId,
                ),
              })
            }
          >
            {t.label}
          </Button>
        ))}
        {selected.size > 0 ? (
          <div className="ml-auto flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void bulk("resolved")}
            >
              Resolve ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void bulk("muted")}
            >
              Ignore
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void bulk("unresolved")}
            >
              Reopen
            </Button>
          </div>
        ) : (
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {filteredIssues.length.toLocaleString()} issues
          </span>
        )}
      </div>

      {filteredIssues.length === 0 ? (
        <ObserveEmptyState
          title={
            issues.length === 0
              ? `No ${issueStatus === "muted" ? "ignored" : issueStatus} issues`
              : "No matching issues"
          }
          description={
            issues.length === 0
              ? "Grouped errors will show up here when events arrive."
              : "Try clearing search or widening the time range."
          }
        />
      ) : (
        <div className="surface-panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="data-table-head data-table-cell w-10 pl-4">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => {
                      if (v) {
                        setSelected(new Set(filteredIssues.map((i) => i.id)))
                      } else setSelected(new Set())
                    }}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead className="data-table-head data-table-cell">
                  Issue
                </TableHead>
                <TableHead className="data-table-head data-table-cell w-28">
                  Trend
                </TableHead>
                <TableHead className="data-table-head data-table-cell w-20">
                  Events
                </TableHead>
                <TableHead className="data-table-head data-table-cell w-28">
                  First
                </TableHead>
                <TableHead className="data-table-head data-table-cell w-28 pr-4">
                  Last
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredIssues.map((issue, idx) => (
                <TableRow
                  key={issue.id}
                  className={cn(
                    "data-table-row",
                    selected.has(issue.id) && "bg-muted/40",
                    focusIdx === idx && "ring-1 ring-inset ring-ring/40",
                  )}
                >
                  <TableCell className="data-table-cell pl-4">
                    <Checkbox
                      checked={selected.has(issue.id)}
                      onCheckedChange={() => toggle(issue.id)}
                      aria-label={`Select ${issue.title}`}
                    />
                  </TableCell>
                  <TableCell className="data-table-cell whitespace-normal">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/observe/projects/$projectId/issues/$issueId"
                        params={{ projectId, issueId: issue.id }}
                        search={serializeIssueSearch(context)}
                        className="font-medium hover:underline"
                      >
                        {issue.title}
                      </Link>
                      {issue.level ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                          {issue.level}
                        </span>
                      ) : null}
                    </div>
                    {issue.culprit ? (
                      <div className="text-xs text-muted-foreground">
                        {issue.culprit}
                      </div>
                    ) : null}
                    <div className="mt-1 flex gap-2">
                      <button
                        type="button"
                        className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                        onClick={() => setDrawerIssueId(issue.id)}
                      >
                        Inspect
                      </button>
                      {issue.lastTraceId ? (
                        <Link
                          to="/observe/projects/$projectId/traces/$traceId"
                          params={{
                            projectId,
                            traceId: issue.lastTraceId,
                          }}
                          search={serializeTraceSearch(context)}
                          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                        >
                          Trace
                        </Link>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="data-table-cell">
                    <Sparkline buckets={trends[issue.id] ?? []} />
                  </TableCell>
                  <TableCell className="data-table-cell">
                    <Link
                      to="/observe/projects/$projectId/issues/$issueId"
                      params={{ projectId, issueId: issue.id }}
                      search={serializeIssueSearch(context)}
                      className="tabular-nums hover:underline"
                    >
                      {issue.count}
                    </Link>
                  </TableCell>
                  <TableCell className="data-table-cell text-muted-foreground">
                    {formatRelativeTime(issue.firstSeen)}
                  </TableCell>
                  <TableCell className="data-table-cell pr-4 text-muted-foreground">
                    {formatRelativeTime(issue.lastSeen)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DetailDrawer
        open={!!drawerIssueId}
        onOpenChange={(open) => {
          if (!open) setDrawerIssueId(null)
        }}
        title="Event"
        description={drawerIssueId ?? undefined}
        className="sm:max-w-lg md:max-w-xl"
      >
        {drawerEventState === "loading" ? (
          <p className="text-sm text-muted-foreground">Loading event…</p>
        ) : drawerEventState === "error" ? (
          <p className="text-sm text-muted-foreground">
            Could not load the latest event for this issue.
          </p>
        ) : drawerEventState === "empty" ? (
          <p className="text-sm text-muted-foreground">
            No event recorded for this issue yet.
          </p>
        ) : (
          <EventInspector
            event={drawerEvent}
            projectId={projectId}
            context={context}
            issueId={drawerIssueId ?? undefined}
            compact
            onContextChange={(next) =>
              void navigate({
                search: serializeIssuesListSearch(
                  next,
                  issueStatus,
                  drawerIssueId,
                ),
                replace: true,
              })
            }
          />
        )}
        {drawerIssueId ? (
          <div className="mt-4">
            <Button
              size="sm"
              variant="outline"
              render={
                <Link
                  to="/observe/projects/$projectId/issues/$issueId"
                  params={{ projectId, issueId: drawerIssueId }}
                  search={serializeIssueSearch(
                    context,
                    drawerEvent?.event_id,
                  )}
                />
              }
            >
              Open full issue
            </Button>
          </div>
        ) : null}
      </DetailDrawer>
    </ObserveProjectShell>
  )
}
