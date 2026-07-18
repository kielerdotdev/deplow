import { useEffect, useMemo, useState } from "react"
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { ActionDialog } from "@/components/action-dialog"
import { ConfirmActionDialog } from "@/components/confirm-action-dialog"
import {
  InsightWidget,
  ObserveEmptyState,
  ObserveProjectShell,
  TimeRangePicker,
} from "@/components/observe"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getSession } from "@/lib/auth.functions"
import { parseContext, type ObserveContext } from "@/lib/observe/context"
import {
  parseDashboardLayout,
  type DashboardLayout,
} from "@/lib/observe/insights"
import { client } from "@/lib/orpc"

export const Route = createFileRoute(
  "/observe/projects/$projectId/dashboards_/$dashboardId",
)({
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    await client.observe.projects.enable({ projectId: params.projectId }).catch(
      () => null,
    )
    const [project, board, insights] = await Promise.all([
      client.projects.get({ id: params.projectId }),
      client.observe.dashboards.get({
        projectId: params.projectId,
        dashboardId: params.dashboardId,
      }),
      client.observe.insights
        .list({ projectId: params.projectId })
        .catch(() => []),
    ])
    return { project, board, insights }
  },
  component: BoardDetailPage,
})

function BoardDetailPage() {
  const { project, board, insights } = Route.useLoaderData()
  const { projectId, dashboardId } = Route.useParams()
  const router = useRouter()
  const [context, setContext] = useState<ObserveContext>(() =>
    parseContext({}),
  )
  const [name, setName] = useState(board.name)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(board.name)
  }, [board.name])

  const layout: DashboardLayout = useMemo(() => {
    if (
      board.layout &&
      typeof board.layout === "object" &&
      Array.isArray((board.layout as DashboardLayout).widgets)
    ) {
      return board.layout as DashboardLayout
    }
    return parseDashboardLayout(
      typeof board.layoutJson === "string"
        ? board.layoutJson
        : JSON.stringify(board.layoutJson ?? { widgets: [] }),
    )
  }, [board])

  const widgets = Array.isArray(layout.widgets) ? layout.widgets : []
  const insightMap = useMemo(
    () =>
      new Map([...board.insights, ...insights].map((i) => [i.id, i] as const)),
    [board.insights, insights],
  )
  const usedIds = new Set(widgets.map((w) => w.insightId))
  const available = insights.filter((i) => !usedIds.has(i.id))

  async function saveLayout(next: DashboardLayout, nextName?: string) {
    setBusy(true)
    try {
      await client.observe.dashboards.update({
        projectId,
        dashboardId,
        ...(nextName !== undefined ? { name: nextName } : {}),
        layout: next,
      })
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  async function addWidget(insightId: string) {
    const insight = insights.find((i) => i.id === insightId)
    const next: DashboardLayout = {
      ...layout,
      widgets: [
        ...widgets,
        {
          id: crypto.randomUUID(),
          insightId,
          title: insight?.name,
          colSpan: 1 as const,
        },
      ],
    }
    setAddOpen(false)
    await saveLayout(next)
  }

  async function removeWidget(widgetId: string) {
    await saveLayout({
      ...layout,
      widgets: widgets.filter((w) => w.id !== widgetId),
    })
  }

  return (
    <ObserveProjectShell
      projectId={projectId}
      title={board.name}
      description={`Board · ${project.name}`}
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <TimeRangePicker
            value={context.time}
            onChange={(time) => setContext({ ...context, time })}
          />
          <Button
            size="sm"
            className="gap-1.5"
            disabled={busy || insights.length === 0}
            onClick={() => setAddOpen(true)}
          >
            <PlusIcon className="size-3.5" />
            Add chart
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setName(board.name)
              setRenameOpen(true)
            }}
          >
            Rename
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            aria-label="Delete board"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      }
    >
      {widgets.length === 0 ? (
        <ObserveEmptyState
          title="Empty board"
          description="Add a saved chart as a widget, or create one from Saved charts first."
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={insights.length === 0}
                onClick={() => setAddOpen(true)}
              >
                Add chart
              </Button>
              <Button
                size="sm"
                variant="outline"
                render={
                  <Link
                    to="/observe/projects/$projectId/insights"
                    params={{ projectId }}
                  />
                }
              >
                Open saved charts
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {widgets.map((w) => {
            const insight = insightMap.get(w.insightId)
            if (!insight) {
              return (
                <div
                  key={w.id}
                  className="surface-panel flex items-center justify-between gap-2 p-4 text-sm"
                >
                  <span className="text-muted-foreground">
                    Missing chart
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void removeWidget(w.id)}
                  >
                    Remove
                  </Button>
                </div>
              )
            }
            return (
              <div key={w.id} className="relative">
                <InsightWidget
                  projectId={projectId}
                  context={context}
                  widget={w}
                  insight={insight}
                  onContextChange={setContext}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
                  aria-label="Remove widget"
                  onClick={() => void removeWidget(w.id)}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      )}

      <ActionDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename board"
        description="Update the display name for this board."
        size="sm"
        footer={
          <div className="flex w-full gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={renaming}
              onClick={() => setRenameOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={
                renaming || !name.trim() || name.trim() === board.name
              }
              onClick={() => {
                void (async () => {
                  setRenaming(true)
                  try {
                    await client.observe.dashboards.update({
                      projectId,
                      dashboardId,
                      name: name.trim(),
                    })
                    setRenameOpen(false)
                    await router.invalidate()
                  } finally {
                    setRenaming(false)
                  }
                })()
              }}
            >
              {renaming ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          disabled={renaming}
          aria-label="Board name"
        />
      </ActionDialog>

      <ActionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add chart"
        description="Pick a saved chart to place on this board."
        size="md"
        footer={
          <div className="flex w-full flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            {insights.length === 0 ? (
              <Button
                size="sm"
                className="flex-1"
                render={
                  <Link
                    to="/observe/projects/$projectId/insights"
                    params={{ projectId }}
                    search={{ new: true }}
                  />
                }
              >
                Create chart
              </Button>
            ) : null}
          </div>
        }
      >
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {insights.length === 0
              ? "No saved charts yet."
              : "All saved charts are already on this board."}
          </p>
        ) : (
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {available.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  className="flex w-full px-3 py-2.5 text-left text-sm hover:bg-muted/40"
                  onClick={() => void addWidget(i.id)}
                >
                  {i.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </ActionDialog>

      <ConfirmActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete board"
        description={`Remove “${board.name}”? Saved charts are kept.`}
        confirmLabel="Delete board"
        onConfirm={async () => {
          await client.observe.dashboards.delete({
            projectId,
            dashboardId,
          })
          void router.navigate({
            to: "/observe/projects/$projectId/dashboards",
            params: { projectId },
          })
        }}
      />
    </ObserveProjectShell>
  )
}
