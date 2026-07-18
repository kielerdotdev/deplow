import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"

import {
  ChartFrame,
  CorrelationLinks,
  EventInspector,
  InvestigationSummary,
  IssueHero,
  ObserveProjectShell,
  VisualizationCanvas,
} from "@/components/observe"
import { parseExceptionFrames } from "@/components/observe/stack-frames"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/auth.functions"
import {
  digDownTime,
  parseContext,
  resolveTimeRange,
  serializeContext,
  serializeIssueSearch,
} from "@/lib/observe/context"
import { buildDebugPrompt } from "@/lib/observe/debug-prompt"
import { client } from "@/lib/orpc"
import { formatRelativeTime } from "@/lib/ui-format"

export const Route = createFileRoute(
  "/observe/projects/$projectId/issues_/$issueId",
)({
  validateSearch: (search) =>
    serializeIssueSearch(
      parseContext(search),
      typeof search.event === "string" ? search.event : undefined,
    ),
  loader: async ({ params, location }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    const issue = await client.observe.issues.get({ issueId: params.issueId })
    const events = await client.observe.events
      .listForIssue({
        projectId: params.projectId,
        issueId: params.issueId,
      })
      .catch(() => [])
    const searchEvent = (location.search as { event?: string }).event
    const recommended = pickRecommended(events)
    const eventId = searchEvent ?? recommended?.event_id ?? issue.lastEventId
    const event = eventId
      ? await client.observe.events
          .get({ projectId: params.projectId, eventId })
          .catch(() => null)
      : null
    return { issue, event, events, eventId }
  },
  component: IssueDetailPage,
})

type EventSummary = {
  event_id: string
  timestamp: string
  level: string
  message: string
  culprit: string
  digest_order: number
  trace_id?: string
}

function pickRecommended(events: EventSummary[]): EventSummary | undefined {
  const withTrace = events.find((e) => e.trace_id)
  if (withTrace) return withTrace
  return [...events].sort((a, b) => b.digest_order - a.digest_order)[0]
}

function IssueDetailPage() {
  const { issue, event, events, eventId } = Route.useLoaderData()
  const { projectId, issueId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const context = parseContext(search)
  const [activeEvent, setActiveEvent] = useState(event)
  const [series, setSeries] = useState<Array<{ t: number; v: number }>>([])
  const [matchingCount, setMatchingCount] = useState<number | null>(null)
  const [chartState, setChartState] = useState<"loading" | "idle" | "error">(
    "loading",
  )

  const orderedNewest = useMemo(
    () => [...events].sort((a, b) => b.digest_order - a.digest_order),
    [events],
  )
  const orderedOldest = useMemo(
    () => [...events].sort((a, b) => a.digest_order - b.digest_order),
    [events],
  )

  const currentId = search.event ?? eventId ?? orderedNewest[0]?.event_id
  const currentIdx = orderedNewest.findIndex((e) => e.event_id === currentId)

  function setEventId(next: string | undefined) {
    void navigate({
      search: serializeIssueSearch(context, next),
      replace: true,
    })
  }

  useEffect(() => {
    if (!currentId) {
      setActiveEvent(null)
      return
    }
    if (activeEvent?.event_id === currentId) return
    let cancelled = false
    void client.observe.events
      .get({ projectId, eventId: currentId })
      .then((e) => {
        if (!cancelled) setActiveEvent(e)
      })
      .catch(() => {
        if (!cancelled) setActiveEvent(null)
      })
    return () => {
      cancelled = true
    }
  }, [currentId, projectId])

  useEffect(() => {
    let cancelled = false
    const range = resolveTimeRange(context.time)
    setChartState("loading")
    void client.observe.issues
      .eventSeries({
        projectId,
        issueId,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      })
      .then((res) => {
        if (cancelled) return
        setSeries(res.series)
        setMatchingCount(res.matchingCount)
        setChartState("idle")
      })
      .catch(() => {
        if (!cancelled) setChartState("error")
      })
    return () => {
      cancelled = true
    }
  }, [projectId, issueId, search])

  const traceId = activeEvent?.trace_id || issue.lastTraceId || undefined
  const aroundMs = activeEvent?.timestamp
    ? Date.parse(activeEvent.timestamp)
    : null

  return (
    <ObserveProjectShell
      projectId={projectId}
      title={issue.title}
      description={
        issue.culprit ||
        "No culprit — the SDK did not report a transaction or failing function."
      }
      context={context}
      onContextChange={(next) =>
        void navigate({
          search: serializeIssueSearch(next, search.event),
          replace: true,
        })
      }
      actions={
        <div className="flex flex-wrap gap-2">
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
            variant="outline"
            onClick={() =>
              void client.observe.issues.updateStatus({
                issueId: issue.id,
                status: "muted",
              })
            }
          >
            Ignore
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const url = window.prompt(
                "Link external ticket URL (Linear/GitHub/Jira)",
                issue.externalIssueUrl ?? "",
              )
              if (url === null) return
              void client.observe.issues
                .updateTriage({
                  issueId: issue.id,
                  externalIssueUrl: url || null,
                })
                .catch(() => null)
            }}
          >
            Link ticket
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(window.location.href)
            }}
          >
            Copy link
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const frames = activeEvent?.exception_json
                ? parseExceptionFrames(activeEvent.exception_json)
                : []
              const top = frames[0]
              const topFrame = top
                ? `${top.filename ?? "?"}:${top.lineno ?? "?"} in ${top.function ?? "?"}`
                : issue.culprit
              void navigator.clipboard.writeText(
                buildDebugPrompt({
                  kind: "issue",
                  title: issue.title,
                  projectId,
                  traceId,
                  message: activeEvent?.message ?? issue.culprit ?? undefined,
                  topFrame: topFrame ?? undefined,
                }),
              )
            }}
          >
            Copy as prompt
          </Button>
          <Button
            size="sm"
            variant="ghost"
            render={
              <Link
                to="/observe/projects/$projectId/issues"
                params={{ projectId }}
                search={{
                  ...serializeContext(context),
                  status: "unresolved",
                  inspect: undefined,
                }}
              />
            }
          >
            Back
          </Button>
        </div>
      }
    >
      <IssueHero
        className="mb-4"
        title={issue.title}
        message={issue.culprit}
        level={issue.level}
        topFrame={(() => {
          const frames = activeEvent?.exception_json
            ? parseExceptionFrames(activeEvent.exception_json)
            : []
          const top = frames[0]
          return top
            ? `${top.filename ?? "?"}:${top.lineno ?? "?"} in ${top.function ?? "?"}`
            : null
        })()}
      />

      <InvestigationSummary
        evidence={{
          title: issue.title,
          culprit: issue.culprit,
          eventCount: issue.count,
          hasTrace: Boolean(traceId),
          hasFrames: Boolean(
            activeEvent?.exception_json &&
              activeEvent.exception_json.includes("filename"),
          ),
          firstSeenLabel: formatRelativeTime(issue.firstSeen),
          release: null,
        }}
      />

      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="tabular-nums text-muted-foreground">
          <span className="font-medium text-foreground">
            {issue.count.toLocaleString()}
          </span>{" "}
          lifetime events
        </span>
        {matchingCount != null ? (
          <span className="tabular-nums text-muted-foreground">
            <span className="font-medium text-foreground">
              {matchingCount.toLocaleString()}
            </span>{" "}
            matching current filters
          </span>
        ) : null}
        {issue.priority ? (
          <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] capitalize">
            {issue.priority} priority
          </span>
        ) : null}
      </div>

      <ChartFrame
        title="Events"
        description={
          series.filter((p) => p.v > 0).length <= 1
            ? "Sparse event volume — one lifetime occurrence may look like a solid block"
            : "Volume in the selected time range"
        }
        state={chartState}
        hint="Brush to zoom · click a bar to dig in"
        className="mb-4"
        actions={
          <CorrelationLinks
            projectId={projectId}
            context={context}
            eventId={activeEvent?.event_id}
            traceId={traceId}
            issueId={issue.id}
            aroundMs={aroundMs}
          />
        }
      >
        <VisualizationCanvas
          kind="bar"
          series={series}
          height={orderedNewest.length <= 1 ? 100 : 160}
          valueLabel="Events"
          onBrush={(_a, _b, from, to) => {
            void navigate({
              search: serializeIssueSearch(
                digDownTime(context, from.t, to.t),
                search.event,
              ),
              replace: true,
            })
          }}
          onPointClick={(point) => {
            const half = 30 * 60_000
            void navigate({
              search: serializeIssueSearch(
                digDownTime(context, point.t - half, point.t + half),
                search.event,
              ),
              replace: true,
            })
          }}
        />
      </ChartFrame>

      {orderedNewest.length <= 1 ? (
        <div className="mb-3 text-sm text-muted-foreground">
          {orderedNewest.length === 1
            ? "First and only event in this issue"
            : "No events loaded"}
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Event</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const rec = pickRecommended(events)
              if (rec) setEventId(rec.event_id)
            }}
          >
            Recommended
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!orderedOldest[0]}
            onClick={() => setEventId(orderedOldest[0]?.event_id)}
          >
            Oldest
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!orderedNewest[0]}
            onClick={() => setEventId(orderedNewest[0]?.event_id)}
          >
            Newest
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={currentIdx < 0 || currentIdx >= orderedNewest.length - 1}
            onClick={() => {
              const next = orderedNewest[currentIdx + 1]
              if (next) setEventId(next.event_id)
            }}
          >
            Older
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={currentIdx <= 0}
            onClick={() => {
              const next = orderedNewest[currentIdx - 1]
              if (next) setEventId(next.event_id)
            }}
          >
            Newer
          </Button>
          <span className="tabular-nums text-muted-foreground">
            {currentIdx >= 0 ? currentIdx + 1 : 0} / {orderedNewest.length}
          </span>
        </div>
      )}

      <div className="surface-panel p-5">
        <EventInspector
          event={activeEvent}
          projectId={projectId}
          context={context}
          issueId={issue.id}
          onContextChange={(next) =>
            void navigate({
              search: serializeIssueSearch(next, search.event),
              replace: true,
            })
          }
        />
        <div className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          Grouping: <code className="text-[11px]">hostrig-v1</code> · Issue{" "}
          <code className="text-[11px]">{issue.id}</code>
        </div>
      </div>
    </ObserveProjectShell>
  )
}
