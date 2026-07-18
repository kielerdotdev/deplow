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
  IssuesFilterSidebar,
  IssuesToolbar,
  ObserveEmptyState,
  ObservePageLayout,
  ObserveProjectShell,
  ResourceRow,
  ResourceTable,
  ResourceTableBody,
  ResourceTableHead,
  ResourceTh,
  Sparkline,
  filterIssuesByContext,
} from "@/components/observe"
import {
  hasStructuredIssueFilters,
} from "@/components/observe/issues-filter-sidebar"
import {
  formatIssueCulprit,
  issueLevelBadgeClass,
  issueLevelTone,
  issueTitlePreview,
} from "@/components/observe/issue-list-utils"
import { resolveIssuesEmptyState } from "@/components/observe/issues-empty-state"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
    const [issues, unresolved, resolved, muted, project] = await Promise.all([
      client.observe.issues
        .list({ projectId: params.projectId, status: issueStatus })
        .catch(() => []),
      client.observe.issues
        .list({ projectId: params.projectId, status: "unresolved" })
        .catch(() => []),
      client.observe.issues
        .list({ projectId: params.projectId, status: "resolved" })
        .catch(() => []),
      client.observe.issues
        .list({ projectId: params.projectId, status: "muted" })
        .catch(() => []),
      client.projects.get({ id: params.projectId }),
    ])
    return {
      issues,
      project,
      issueStatus,
      statusCounts: {
        unresolved: unresolved.length,
        resolved: resolved.length,
        muted: muted.length,
      },
    }
  },
  component: IssuesPage,
})

const TABS = [
  { id: "unresolved" as const, label: "Unresolved" },
  { id: "resolved" as const, label: "Resolved" },
  { id: "muted" as const, label: "Ignored" },
]

function IssuesPage() {
  const { issues, project, issueStatus, statusCounts } = Route.useLoaderData()
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

  function setContext(next: typeof context) {
    void navigate({
      search: serializeIssuesListSearch(next, issueStatus, drawerIssueId),
      replace: true,
    })
  }

  const filteredIssues = useMemo(
    () => filterIssuesByContext(issues, context),
    [issues, context],
  )

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

  const emptyDecision = resolveIssuesEmptyState({
    issueStatus,
    statusCounts,
    statusIssueCount: issues.length,
    filteredCount: filteredIssues.length,
    hasStructuredFilters: hasStructuredIssueFilters(context),
  })

  function emptyAction(kind: NonNullable<typeof emptyDecision>["primaryAction"]) {
    if (kind === "setup") {
      return (
        <Button
          size="sm"
          variant="outline"
          render={
            <Link to="/observe/projects/$projectId" params={{ projectId }} />
          }
        >
          View setup instructions
        </Button>
      )
    }
    if (kind === "view_resolved") {
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void navigate({
              search: serializeIssuesListSearch(
                context,
                "resolved",
                drawerIssueId,
              ),
            })
          }
        >
          View resolved
        </Button>
      )
    }
    if (kind === "clear_filters") {
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setContext({
              ...context,
              filters: [],
              query: {
                ...context.query,
                q: undefined,
                errorsOnly: undefined,
              },
            })
          }
        >
          Clear filters
        </Button>
      )
    }
    if (kind === "expand_time") {
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setContext({
              ...context,
              time: { kind: "preset", preset: "7d" },
            })
          }
        >
          Expand time range
        </Button>
      )
    }
    return undefined
  }

  function emptySecondary(
    kind: NonNullable<typeof emptyDecision>["secondaryAction"],
  ) {
    if (kind === "go_traces") {
      return (
        <Button
          size="sm"
          variant="ghost"
          render={
            <Link
              to="/observe/projects/$projectId/traces"
              params={{ projectId }}
            />
          }
        >
          Go to traces
        </Button>
      )
    }
    if (kind === "expand_time") {
      return (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            setContext({
              ...context,
              time: { kind: "preset", preset: "7d" },
            })
          }
        >
          Expand time range
        </Button>
      )
    }
    return undefined
  }

  return (
    <ObserveProjectShell
      projectId={projectId}
      title="Issues"
      description={`${project.name} · Grouped by fingerprint`}
      context={context}
      onContextChange={setContext}
      onSaveView={(name) => {
        void client.observe.savedViews.create({
          projectId,
          name,
          surface: "issues",
          contextJson: JSON.stringify(context),
        })
      }}
    >
      <ObservePageLayout.Root className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <IssuesToolbar
            tabs={TABS.map((t) => ({
              value: t.id,
              label: t.label,
              count: statusCounts[t.id],
            }))}
            active={issueStatus}
            onChange={(id) =>
              void navigate({
                search: serializeIssuesListSearch(context, id, drawerIssueId),
              })
            }
            totalCount={filteredIssues.length}
            trailing={
              selected.size > 0 ? (
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => void bulk("resolved")}
                  >
                    Resolve ({selected.size})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => void bulk("muted")}
                  >
                    Ignore
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => void bulk("unresolved")}
                  >
                    Reopen
                  </Button>
                </div>
              ) : null
            }
          />
          <ObservePageLayout.FilterSidebarTrigger />
        </div>

        <ObservePageLayout.Body>
          <ObservePageLayout.FilterSidebar>
            <IssuesFilterSidebar
              issues={issues}
              context={context}
              onChange={setContext}
            />
          </ObservePageLayout.FilterSidebar>
          <ObservePageLayout.Content className="space-y-0">
            {filteredIssues.length === 0 && emptyDecision ? (
              <ObserveEmptyState
                variant={emptyDecision.variant}
                title={emptyDecision.title}
                description={emptyDecision.description}
                action={emptyAction(emptyDecision.primaryAction)}
                secondaryAction={emptySecondary(emptyDecision.secondaryAction)}
              />
            ) : filteredIssues.length === 0 ? (
              <ObserveEmptyState
                variant="empty"
                title="No issues"
                description="No grouped errors to show."
              />
            ) : (
              <ResourceTable>
                <ResourceTableHead>
                  <ResourceTh className="w-10 pl-3.5">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(v) => {
                        if (v) {
                          setSelected(
                            new Set(filteredIssues.map((i) => i.id)),
                          )
                        } else setSelected(new Set())
                      }}
                      aria-label="Select all"
                    />
                  </ResourceTh>
                  <ResourceTh>Issue</ResourceTh>
                  <ResourceTh className="w-[5.5rem] text-right">
                    Trend
                  </ResourceTh>
                  <ResourceTh className="w-16 text-right">Events</ResourceTh>
                  <ResourceTh className="hidden w-20 sm:table-cell">
                    First
                  </ResourceTh>
                  <ResourceTh className="w-20 pr-3.5">Last</ResourceTh>
                </ResourceTableHead>
                <ResourceTableBody>
                  {filteredIssues.map((issue, idx) => {
                    const tone = issueLevelTone(issue.level)
                    const culprit = formatIssueCulprit(issue.culprit)
                    const title = issueTitlePreview(issue.title)
                    const selectedRow = selected.has(issue.id)
                    const focused = focusIdx === idx
                    return (
                      <ResourceRow
                        key={issue.id}
                        className={cn(
                          "group/issue align-top",
                          selectedRow && "bg-foreground/[0.04]",
                          focused && "bg-foreground/[0.05] ring-1 ring-inset ring-ring/35",
                        )}
                      >
                        <td className="w-10 px-3.5 py-3 align-top">
                          <Checkbox
                            checked={selectedRow}
                            onCheckedChange={() => toggle(issue.id)}
                            aria-label={`Select ${issue.title}`}
                            className="mt-0.5"
                          />
                        </td>
                        <td className="min-w-0 px-3 py-3 align-top">
                          <div className="flex min-w-0 flex-col gap-1">
                            <div className="flex min-w-0 items-start gap-2">
                              {issue.level ? (
                                <span
                                  className={cn(
                                    "mt-0.5 shrink-0 rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
                                    issueLevelBadgeClass[tone],
                                  )}
                                >
                                  {issue.level}
                                </span>
                              ) : null}
                              <Link
                                to="/observe/projects/$projectId/issues/$issueId"
                                params={{ projectId, issueId: issue.id }}
                                search={serializeIssueSearch(context)}
                                title={issue.title}
                                className="min-w-0 text-[13px] font-medium leading-snug text-foreground text-pretty line-clamp-2 transition-colors hover:text-foreground/90"
                              >
                                {title}
                              </Link>
                            </div>
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                              {culprit ? (
                                <span
                                  title={issue.culprit ?? undefined}
                                  className="max-w-[min(100%,28rem)] truncate font-mono text-[11px] leading-none text-muted-foreground/85"
                                >
                                  {culprit}
                                </span>
                              ) : null}
                              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/50 max-sm:opacity-100 sm:opacity-0 sm:transition-opacity sm:duration-150 sm:group-hover/issue:opacity-100 sm:group-focus-within/issue:opacity-100">
                                <button
                                  type="button"
                                  className="font-medium text-muted-foreground transition-colors hover:text-foreground"
                                  onClick={() => setDrawerIssueId(issue.id)}
                                >
                                  Inspect
                                </button>
                                {issue.lastTraceId ? (
                                  <>
                                    <span aria-hidden>·</span>
                                    <Link
                                      to="/observe/projects/$projectId/traces/$traceId"
                                      params={{
                                        projectId,
                                        traceId: issue.lastTraceId,
                                      }}
                                      search={serializeTraceSearch(context)}
                                      className="font-medium text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                      Trace
                                    </Link>
                                  </>
                                ) : null}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <div className="flex justify-end">
                            <Sparkline
                              buckets={trends[issue.id] ?? []}
                              tone="danger"
                              width={72}
                              height={22}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right align-middle">
                          <Link
                            to="/observe/projects/$projectId/issues/$issueId"
                            params={{ projectId, issueId: issue.id }}
                            search={serializeIssueSearch(context)}
                            className="text-[13px] font-medium tabular-nums text-foreground/90 transition-colors hover:text-foreground"
                          >
                            {issue.count}
                          </Link>
                        </td>
                        <td className="hidden px-3 py-3 align-middle text-[12px] tabular-nums text-muted-foreground sm:table-cell">
                          {formatRelativeTime(issue.firstSeen)}
                        </td>
                        <td className="px-3.5 py-3 pr-3.5 text-right align-middle text-[12px] tabular-nums text-muted-foreground">
                          {formatRelativeTime(issue.lastSeen)}
                        </td>
                      </ResourceRow>
                    )
                  })}
                </ResourceTableBody>
              </ResourceTable>
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
          </ObservePageLayout.Content>
        </ObservePageLayout.Body>
      </ObservePageLayout.Root>
    </ObserveProjectShell>
  )
}
