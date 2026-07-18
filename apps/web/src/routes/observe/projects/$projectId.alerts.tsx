import { useCallback, useEffect, useState } from "react"
import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router"
import { BellIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { ConfirmActionDialog } from "@/components/confirm-action-dialog"
import { AlertHistoryPanel } from "@/components/observe/alert-history-panel"
import { CreateAlertDialog } from "@/components/observe/create-alert-dialog"
import {
  ObserveEmptyState,
  ObserveProjectShell,
} from "@/components/observe"
import {
  ResourceRow,
  ResourceTable,
  ResourceTableBody,
  ResourceTableHead,
  ResourceTd,
  ResourceTh,
} from "@/components/observe/resource-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/auth.functions"
import { formatRelative } from "@/lib/observe/format"
import { client } from "@/lib/orpc"
import { cn } from "@/lib/utils"

type AlertRow = Awaited<
  ReturnType<typeof client.observe.alerts.list>
>[number]

const METRIC_LABELS: Record<string, string> = {
  error_rate: "Error rate",
  rate: "Request rate",
  duration_p95: "p95 latency",
  count: "Count",
}

export const Route = createFileRoute("/observe/projects/$projectId/alerts")({
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    await client.observe.projects.enable({ projectId: params.projectId }).catch(
      () => null,
    )
    const [project, alerts] = await Promise.all([
      client.projects.get({ id: params.projectId }),
      client.observe.alerts.list({ projectId: params.projectId }).catch(() => []),
    ])
    return { project, alerts }
  },
  component: AlertsPage,
})

function conditionLabel(a: AlertRow): string {
  const metric = METRIC_LABELS[a.metric] ?? a.metric
  if (a.kind === "relative") {
    return `${metric} ↑ ${a.threshold} vs prior ${a.window}`
  }
  return `${metric} ${a.operator === "gt" ? ">" : a.operator} ${a.threshold} / ${a.window}`
}

function AlertsPage() {
  const { project, alerts: initial } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const router = useRouter()
  const [alerts, setAlerts] = useState(initial)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)

  useEffect(() => {
    setAlerts(initial)
  }, [initial])

  const refresh = useCallback(async () => {
    const next = await client.observe.alerts
      .list({ projectId })
      .catch(() => [] as AlertRow[])
    setAlerts(next)
    await router.invalidate()
  }, [projectId, router])

  async function toggleEnabled(alert: AlertRow) {
    setBusyId(alert.id)
    try {
      await client.observe.alerts.update({
        projectId,
        alertId: alert.id,
        enabled: !alert.enabled,
      })
      setAlerts((rows) =>
        rows.map((r) =>
          r.id === alert.id ? { ...r, enabled: !r.enabled } : r,
        ),
      )
    } finally {
      setBusyId(null)
    }
  }

  const deleting = alerts.find((a) => a.id === deleteId)

  return (
    <ObserveProjectShell
      projectId={projectId}
      title="Alerts"
      description={`Threshold rules for ${project.name}`}
      actions={
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setCreateOpen(true)}
        >
          <PlusIcon className="size-3.5" />
          Create alert
        </Button>
      }
    >
      {alerts.length === 0 ? (
        <ObserveEmptyState
          icon={BellIcon}
          title="No alerts yet"
          description="Watch error rate, latency, or volume — notify Slack, Discord, email, or a webhook when thresholds trip."
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                Create alert
              </Button>
              <Button
                size="sm"
                variant="outline"
                render={<Link to="/settings/notifications" />}
              >
                Manage channels
              </Button>
            </div>
          }
        />
      ) : (
        <ResourceTable>
          <ResourceTableHead>
            <ResourceTh>Alert</ResourceTh>
            <ResourceTh className="hidden sm:table-cell">Condition</ResourceTh>
            <ResourceTh className="hidden md:table-cell">Last fired</ResourceTh>
            <ResourceTh>Status</ResourceTh>
            <ResourceTh srOnly>Actions</ResourceTh>
          </ResourceTableHead>
          <ResourceTableBody>
            {alerts.map((alert) => (
              <ResourceRow
                key={alert.id}
                className={cn(!alert.enabled && "opacity-70")}
                onClick={() =>
                  setHistoryId((id) => (id === alert.id ? null : alert.id))
                }
              >
                <ResourceTd className="align-top">
                  <div className="font-medium leading-snug">{alert.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                    {conditionLabel(alert)}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {alert.channelIds.length > 0
                      ? `${alert.channelIds.length} channel${alert.channelIds.length === 1 ? "" : "s"}`
                      : alert.channelEmail || alert.channelWebhook
                        ? "Legacy channel"
                        : "No channels"}
                  </div>
                </ResourceTd>
                <ResourceTd className="hidden align-top text-muted-foreground sm:table-cell">
                  <span className="font-mono text-xs tabular-nums">
                    {conditionLabel(alert)}
                  </span>
                </ResourceTd>
                <ResourceTd className="hidden align-top tabular-nums text-muted-foreground md:table-cell">
                  {alert.lastTriggeredAt
                    ? formatRelative(new Date(alert.lastTriggeredAt).getTime())
                    : "Never"}
                </ResourceTd>
                <ResourceTd className="align-top">
                  <div className="flex flex-wrap gap-1">
                    <Badge
                      variant={alert.enabled ? "secondary" : "outline"}
                      className="font-normal"
                    >
                      {alert.enabled ? "On" : "Off"}
                    </Badge>
                    {"state" in alert && alert.state ? (
                      <Badge
                        variant={
                          alert.state === "firing"
                            ? "destructive"
                            : alert.state === "pending"
                              ? "secondary"
                              : "outline"
                        }
                        className="font-normal capitalize"
                      >
                        {String(alert.state)}
                      </Badge>
                    ) : null}
                  </div>
                </ResourceTd>
                <ResourceTd stopPropagation className="align-top text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setHistoryId((id) =>
                          id === alert.id ? null : alert.id,
                        )
                      }
                    >
                      History
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === alert.id}
                      onClick={() => {
                        setBusyId(alert.id)
                        void client.observe.alerts
                          .evaluateNow({ projectId, alertId: alert.id })
                          .then(() => refresh())
                          .finally(() => setBusyId(null))
                      }}
                    >
                      Eval
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === alert.id}
                      onClick={() => void toggleEnabled(alert)}
                    >
                      {alert.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${alert.name}`}
                      onClick={() => setDeleteId(alert.id)}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </div>
                </ResourceTd>
              </ResourceRow>
            ))}
          </ResourceTableBody>
        </ResourceTable>
      )}

      {historyId ? (
        <AlertHistoryPanel
          className="mt-4"
          projectId={projectId}
          alertId={historyId}
          alertName={alerts.find((a) => a.id === historyId)?.name}
        />
      ) : null}

      <CreateAlertDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void refresh()}
      />

      <ConfirmActionDialog
        open={deleteId != null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null)
        }}
        title="Delete alert"
        description={
          deleting
            ? `Remove “${deleting.name}”? This stops evaluations and notifications for this rule.`
            : "Remove this alert?"
        }
        confirmLabel="Delete alert"
        onConfirm={async () => {
          if (!deleteId) return
          await client.observe.alerts.delete({
            projectId,
            alertId: deleteId,
          })
          setAlerts((rows) => rows.filter((r) => r.id !== deleteId))
          setDeleteId(null)
          await router.invalidate()
        }}
      />
    </ObserveProjectShell>
  )
}
