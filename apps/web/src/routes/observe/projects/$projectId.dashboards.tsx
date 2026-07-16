import { useEffect, useState } from "react"
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { LayoutDashboardIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { ConfirmActionDialog } from "@/components/confirm-action-dialog"
import {
  ObserveEmptyState,
  ObserveProjectShell,
} from "@/components/observe"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/auth.functions"
import { parseDashboardLayout } from "@/lib/observe/insights"
import { client } from "@/lib/orpc"

type BoardRow = Awaited<
  ReturnType<typeof client.observe.dashboards.list>
>[number]

export const Route = createFileRoute("/observe/projects/$projectId/dashboards")({
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    await client.observe.projects.enable({ projectId: params.projectId }).catch(
      () => null,
    )
    const [project, dashboards] = await Promise.all([
      client.projects.get({ id: params.projectId }),
      client.observe.dashboards
        .list({ projectId: params.projectId })
        .catch(() => [] as BoardRow[]),
    ])
    return { project, dashboards }
  },
  component: DashboardsPage,
})

function widgetCount(d: BoardRow): number {
  try {
    const layout =
      d.layout &&
      typeof d.layout === "object" &&
      Array.isArray((d.layout as { widgets?: unknown }).widgets)
        ? (d.layout as { widgets: unknown[] })
        : parseDashboardLayout(
            typeof d.layoutJson === "string"
              ? d.layoutJson
              : JSON.stringify(d.layoutJson ?? { widgets: [] }),
          )
    return Array.isArray(layout.widgets) ? layout.widgets.length : 0
  } catch {
    return 0
  }
}

function DashboardsPage() {
  const { project, dashboards: initial } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const router = useRouter()
  const [dashboards, setDashboards] = useState(initial)
  const [creating, setCreating] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    setDashboards(initial)
  }, [initial])

  const deleting = dashboards.find((d) => d.id === deleteId)

  async function createBoard() {
    setCreating(true)
    try {
      const { id } = await client.observe.dashboards.create({
        projectId,
        name: "Untitled board",
        template: "blank",
      })
      await router.invalidate()
      void router.navigate({
        to: "/observe/projects/$projectId/dashboards/$dashboardId",
        params: { projectId, dashboardId: id },
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <ObserveProjectShell
      projectId={projectId}
      title="Boards"
      description={`Grids of saved charts for ${project.name}`}
      actions={
        <Button
          size="sm"
          className="gap-1.5"
          disabled={creating}
          onClick={() => void createBoard()}
        >
          <PlusIcon className="size-3.5" />
          {creating ? "Creating…" : "New board"}
        </Button>
      }
    >
      {dashboards.length === 0 ? (
        <ObserveEmptyState
          icon={LayoutDashboardIcon}
          title="No boards yet"
          description="Boards are grids of saved charts with a shared time range."
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void createBoard()}>
                New board
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
                Saved charts
              </Button>
            </div>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Board</th>
                <th className="hidden px-3 py-2.5 font-medium sm:table-cell">
                  Widgets
                </th>
                <th className="px-3 py-2.5 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {dashboards.map((d) => (
                <tr
                  key={d.id}
                  className="transition-colors hover:bg-muted/30"
                >
                  <td className="px-3 py-3 align-middle">
                    <Link
                      to="/observe/projects/$projectId/dashboards/$dashboardId"
                      params={{ projectId, dashboardId: d.id }}
                      className="font-medium hover:underline"
                    >
                      {d.name}
                    </Link>
                    <div className="mt-0.5 text-xs capitalize text-muted-foreground">
                      {d.template}
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 align-middle tabular-nums text-muted-foreground sm:table-cell">
                    {widgetCount(d)}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        render={
                          <Link
                            to="/observe/projects/$projectId/dashboards/$dashboardId"
                            params={{ projectId, dashboardId: d.id }}
                          />
                        }
                      >
                        Open
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${d.name}`}
                        onClick={() => setDeleteId(d.id)}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmActionDialog
        open={deleteId != null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null)
        }}
        title="Delete board"
        description={
          deleting
            ? `Remove “${deleting.name}”? Saved charts are kept.`
            : "Remove this board?"
        }
        confirmLabel="Delete board"
        onConfirm={async () => {
          if (!deleteId) return
          await client.observe.dashboards.delete({
            projectId,
            dashboardId: deleteId,
          })
          setDashboards((rows) => rows.filter((r) => r.id !== deleteId))
          setDeleteId(null)
          await router.invalidate()
        }}
      />
    </ObserveProjectShell>
  )
}
