import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"

import {
  parseExceptionFrames,
  StackFramesView,
} from "@/components/observe/stack-frames"
import { ObserveProjectShell } from "@/components/observe"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/auth.functions"
import { parseContext, serializeContext } from "@/lib/observe/context"
import { client } from "@/lib/orpc"
import { loadShellContext } from "@/lib/shell-context"

export const Route = createFileRoute(
  "/observe/projects/$projectId/issues_/$issueId",
)({
  validateSearch: (search) => serializeContext(parseContext(search)),
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    const shell = await loadShellContext()
    const status = await client.observe.status().catch(() => null)
    const issue = await client.observe.issues.get({ issueId: params.issueId })
    const events = await client.observe.events
      .listForIssue({
        projectId: params.projectId,
        issueId: params.issueId,
      })
      .catch(() => [])
    const eventId = issue.lastEventId ?? events[0]?.event_id
    const event = eventId
      ? await client.observe.events
          .get({ projectId: params.projectId, eventId })
          .catch(() => null)
      : null
    return { session, shell, status, issue, event, events }
  },
  component: IssueDetailPage,
})

function IssueDetailPage() {
  const { session, shell, status, issue, event, events } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const context = parseContext(search)
  const [tab, setTab] = useState<"stack" | "breadcrumbs" | "json" | "why">(
    "stack",
  )
  const [eventIdx, setEventIdx] = useState(0)
  const [activeEvent, setActiveEvent] = useState(event)

  const ordered = useMemo(
    () => [...events].sort((a, b) => b.digest_order - a.digest_order),
    [events],
  )

  useEffect(() => {
    const id = ordered[eventIdx]?.event_id
    if (!id) return
    void client.observe.events
      .get({ projectId, eventId: id })
      .then(setActiveEvent)
      .catch(() => setActiveEvent(null))
  }, [eventIdx, ordered, projectId])

  const frames = useMemo(
    () => parseExceptionFrames(activeEvent?.exception_json ?? ""),
    [activeEvent],
  )

  const traceId = activeEvent?.trace_id || issue.lastTraceId || undefined

  return (
    <ObserveProjectShell
      user={session.user}
      instanceAdmin={shell.instanceAdmin}
      organizations={shell.organizations}
      activeOrganization={shell.activeOrganization}
      observeEnabled={status?.enabled === true}
      projectId={projectId}
      title={issue.title}
      description={issue.culprit || "No culprit"}
      context={context}
      onContextChange={(next) =>
        void navigate({ search: serializeContext(next), replace: true })
      }
      actions={
        <div className="flex flex-wrap gap-2">
          {traceId ? (
            <Button
              size="sm"
              variant="outline"
              render={
                <Link
                  to="/observe/projects/$projectId/traces/$traceId"
                  params={{ projectId, traceId }}
                  search={serializeContext(context)}
                />
              }
            >
              Open trace
            </Button>
          ) : null}
          {traceId ? (
            <Button
              size="sm"
              variant="outline"
              render={
                <Link
                  to="/observe/projects/$projectId/logs"
                  params={{ projectId }}
                  search={serializeContext({
                    ...context,
                    query: { ...context.query, traceId },
                  })}
                />
              }
            >
              Correlated logs
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void client.observe.issues.updateStatus({
                issueId: issue.id,
                status: "resolved",
              })
            }
          >
            Resolve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            render={
              <Link
                to="/observe/projects/$projectId/issues"
                params={{ projectId }}
                search={{ status: "unresolved" }}
              />
            }
          >
            Back
          </Button>
        </div>
      }
    >
      {ordered.length > 1 ? (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Event</span>
          <Button
            size="sm"
            variant="outline"
            disabled={eventIdx >= ordered.length - 1}
            onClick={() => setEventIdx((i) => i + 1)}
          >
            Older
          </Button>
          <span className="tabular-nums">
            {eventIdx + 1} / {ordered.length}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={eventIdx <= 0}
            onClick={() => setEventIdx((i) => i - 1)}
          >
            Newer
          </Button>
        </div>
      ) : null}

      <div className="mb-4 flex gap-2 border-b border-border pb-2">
        {(
          [
            ["stack", "Stacktrace"],
            ["breadcrumbs", "Breadcrumbs"],
            ["why", "Why grouped"],
            ["json", "Event JSON"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={
              tab === id
                ? "border-b-2 border-foreground px-2 py-1 text-sm font-medium"
                : "px-2 py-1 text-sm text-muted-foreground"
            }
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "stack" ? (
        <StackFramesView
          frames={frames}
          emptyMessage={
            activeEvent?.message || "No stack frames on this event."
          }
        />
      ) : null}

      {tab === "breadcrumbs" ? (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            Technical breadcrumbs only (no user/behavior panels).
          </p>
          <pre className="overflow-auto rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
            {activeEvent?.breadcrumbs_json || "[]"}
          </pre>
        </div>
      ) : null}

      {tab === "why" ? (
        <div className="space-y-2 text-sm">
          <p>
            Grouping mechanism: <code className="text-xs">deplow-v1</code>
          </p>
          <p className="text-muted-foreground">
            Events share a fingerprint derived from exception type, module, and
            normalized stack frames. Source maps are deferred (Settings → note).
          </p>
          <p>
            Issue id: <code className="text-xs">{issue.id}</code>
          </p>
          <p>
            Events in group: {issue.count}
          </p>
        </div>
      ) : null}

      {tab === "json" ? (
        <pre className="max-h-[70vh] overflow-auto rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
          {activeEvent?.raw_json
            ? JSON.stringify(JSON.parse(activeEvent.raw_json), null, 2)
            : "No event payload"}
        </pre>
      ) : null}
    </ObserveProjectShell>
  )
}
