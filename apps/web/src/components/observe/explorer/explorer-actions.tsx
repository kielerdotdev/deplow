import { useState } from "react"

import { Button } from "@/components/ui/button"
import { client } from "@/lib/orpc"
import type { TelemetryQuery } from "@/lib/observe/telemetry"
import { telemetryQueryToSearchString } from "@/lib/observe/telemetry"
import { defaultTrendsQuery, emptyFilterGroup } from "@/lib/observe/trends"
import type { TrendsQuery } from "@/lib/observe/trends"

function toTrendsQuery(q: TelemetryQuery): TrendsQuery {
  const base = defaultTrendsQuery()
  const measure =
    q.aggregation?.function === "count_distinct"
      ? "distinct_attr"
      : (q.aggregation?.function ?? "count")
  return {
    ...base,
    time: q.timeRange,
    interval: q.aggregation?.interval ?? "auto",
    filters: q.filter ?? emptyFilterGroup(),
    series: [
      {
        id: crypto.randomUUID(),
        letter: "A",
        label: q.presentation.legend ?? measure,
        signal:
          q.signal === "logs"
            ? "logs"
            : q.signal === "errors"
              ? "errors"
              : q.scope === "root"
                ? "root_spans"
                : "spans",
        measure: measure as TrendsQuery["series"][0]["measure"],
        field: q.aggregation?.field,
        filters: [],
      },
    ],
    breakdowns: (q.groupBy ?? []).map((field) => ({
      field,
      topN: 25,
      rankBy: "count" as const,
      otherBucket: true,
    })),
    viz: {
      kind: q.presentation.view === "table" ? "table" : "line",
      referenceLines: [],
      options: { unit: q.presentation.unit },
    },
  }
}

export function ExplorerActions({
  projectId,
  query,
  className,
}: {
  projectId: string
  query: TelemetryQuery
  className?: string
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function saveView() {
    const name = window.prompt("Name this view")
    if (!name?.trim()) return
    setBusy("save")
    try {
      await client.observe.savedViews.create({
        projectId,
        name: name.trim(),
        surface: "explorer",
        contextJson: JSON.stringify(query),
      })
      setMsg("View saved")
    } catch {
      setMsg("Could not save view")
    } finally {
      setBusy(null)
    }
  }

  async function addToDashboard() {
    const name = window.prompt("Panel title", "Explorer chart")
    if (!name?.trim()) return
    setBusy("dash")
    try {
      const dashboards = await client.observe.dashboards.list({ projectId })
      let dashboardId = dashboards[0]?.id
      if (!dashboardId) {
        const created = await client.observe.dashboards.create({
          projectId,
          name: "Main",
        })
        dashboardId = created.id
      }
      const insight = await client.observe.insights.create({
        projectId,
        name: name.trim(),
        spec: toTrendsQuery(query),
      })
      const dash = await client.observe.dashboards.get({
        projectId,
        dashboardId,
      })
      const widgets = [
        ...(dash.layout.widgets ?? []),
        {
          id: crypto.randomUUID(),
          insightId: insight.id,
          title: name.trim(),
          colSpan: 1 as const,
        },
      ]
      await client.observe.dashboards.update({
        projectId,
        dashboardId,
        layout: { ...dash.layout, widgets },
      })
      setMsg("Added to dashboard")
    } catch {
      setMsg("Could not add to dashboard")
    } finally {
      setBusy(null)
    }
  }

  async function createAlert() {
    const name = window.prompt("Alert name", "Explorer threshold")
    if (!name?.trim()) return
    const threshold = window.prompt("Threshold value", "1")
    if (threshold == null) return
    setBusy("alert")
    try {
      const channels = await client.messageChannels.list()
      const channelIds = channels.filter((c) => c.enabled).map((c) => c.id)
      if (!channelIds.length) {
        setMsg("Add a notification channel in Settings first")
        return
      }
      await client.observe.alerts.create({
        projectId,
        name: name.trim(),
        kind: "threshold",
        metric: query.aggregation?.function ?? "count",
        operator: "gt",
        threshold: String(threshold),
        window: "5m",
        channelIds: [channelIds[0]!],
        contextJson: JSON.stringify(query),
      })
      setMsg("Alert created")
    } catch {
      setMsg("Could not create alert")
    } finally {
      setBusy(null)
    }
  }

  function copyLink() {
    const qs = telemetryQueryToSearchString(query)
    const url = `${window.location.origin}/observe/projects/${projectId}/traces?${qs}`
    void navigator.clipboard.writeText(url)
    setMsg("Link copied")
  }

  return (
    <div className={className} data-testid="explorer-actions">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => void saveView()}
        >
          Save view
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => void addToDashboard()}
        >
          Add to dashboard
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => void createAlert()}
        >
          Create alert
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={copyLink}
        >
          Copy link
        </Button>
      </div>
      {msg ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{msg}</p>
      ) : null}
    </div>
  )
}
