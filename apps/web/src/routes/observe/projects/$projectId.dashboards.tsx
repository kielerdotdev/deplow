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
import { CreateBoardDialog } from "@/components/observe/create-board-dialog"
import {
  ResourceRow,
  ResourceTable,
  ResourceTableBody,
  ResourceTableHead,
  ResourceTd,
  ResourceTh,
} from "@/components/observe/resource-table"
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
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    setDashboards(initial)
  }, [initial])

  const deleting = dashboards.find((d) => d.id === deleteId)

  function openBoard(id: string) {
    void router.navigate({
      to: "/observe/projects/$projectId/dashboards/$dashboardId",
      params: { projectId, dashboardId: id },
    })
  }

  return (
    <ObserveProjectShell
      projectId={projectId}
      title="Boards"
      description={`Chart grids for ${project.name}`}
      actions={
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setCreateOpen(true)}
        >
          <PlusIcon className="size-3.5" />
          New board
        </Button>
      }
    >
      {dashboards.length === 0 ? (
        <ObserveEmptyState
          icon={LayoutDashboardIcon}
          title="No boards yet"
          description="Group saved charts on a shared time range. Create a board, then add charts."
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setCreateOpen(true)}>
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
                Charts
              </Button>
            </div>
          }
        />
      ) : (
        <ResourceTable>
          <ResourceTableHead>
            <ResourceTh>Name</ResourceTh>
            <ResourceTh className="hidden sm:table-cell">Template</ResourceTh>
            <ResourceTh className="hidden sm:table-cell">Widgets</ResourceTh>
            <ResourceTh srOnly>Actions</ResourceTh>
          </ResourceTableHead>
          <ResourceTableBody>
            {dashboards.map((d) => {
              const count = widgetCount(d)
              return (
                <ResourceRow key={d.id} onClick={() => openBoard(d.id)}>
                  <ResourceTd>
                    <div className="font-medium leading-snug">{d.name}</div>
                    <div className="mt-0.5 text-xs capitalize text-muted-foreground sm:hidden">
                      {d.template} · {count} widget{count === 1 ? "" : "s"}
                    </div>
                  </ResourceTd>
                  <ResourceTd className="hidden capitalize text-xs text-muted-foreground sm:table-cell">
                    {d.template}
                  </ResourceTd>
                  <ResourceTd className="hidden tabular-nums text-muted-foreground sm:table-cell">
                    {count}
                  </ResourceTd>
                  <ResourceTd stopPropagation className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        onClick={() => openBoard(d.id)}
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
                  </ResourceTd>
                </ResourceRow>
              )
            })}
          </ResourceTableBody>
        </ResourceTable>
      )}

      <CreateBoardDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        onCreated={({ id }) => {
          void router.invalidate()
          void router.navigate({
            to: "/observe/projects/$projectId/dashboards/$dashboardId",
            params: { projectId, dashboardId: id },
          })
        }}
      />

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
