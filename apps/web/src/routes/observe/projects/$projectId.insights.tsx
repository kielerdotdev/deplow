import { useEffect, useState } from "react"
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { ChartLineIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { ConfirmActionDialog } from "@/components/confirm-action-dialog"
import {
  ObserveEmptyState,
  ObserveProjectShell,
} from "@/components/observe"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/auth.functions"
import type { TrendsQuery } from "@/lib/observe/trends"
import { client } from "@/lib/orpc"

type InsightRow = Awaited<
  ReturnType<typeof client.observe.insights.list>
>[number]

export const Route = createFileRoute("/observe/projects/$projectId/insights")({
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    await client.observe.projects.enable({ projectId: params.projectId }).catch(
      () => null,
    )
    const [project, insights] = await Promise.all([
      client.projects.get({ id: params.projectId }),
      client.observe.insights
        .list({ projectId: params.projectId })
        .catch(() => [] as InsightRow[]),
    ])
    return { project, insights }
  },
  component: InsightsPage,
})

function InsightsPage() {
  const { project, insights: initial } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const router = useRouter()
  const [insights, setInsights] = useState(initial)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    setInsights(initial)
  }, [initial])

  const deleting = insights.find((i) => i.id === deleteId)

  return (
    <ObserveProjectShell
      projectId={projectId}
      title="Saved charts"
      description={`Reusable Trends charts for ${project.name}`}
      actions={
        <Button
          size="sm"
          className="gap-1.5"
          render={
            <Link
              to="/observe/projects/$projectId/trends"
              params={{ projectId }}
            />
          }
        >
          <PlusIcon className="size-3.5" />
          Create chart
        </Button>
      }
    >
      {insights.length === 0 ? (
        <ObserveEmptyState
          icon={ChartLineIcon}
          title="No saved charts"
          description="Build a query in Charts, save it, and it will appear here for boards and reuse."
          action={
            <Button
              size="sm"
              render={
                <Link
                  to="/observe/projects/$projectId/trends"
                  params={{ projectId }}
                />
              }
            >
              Open Charts
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Chart</th>
                <th className="hidden px-3 py-2.5 font-medium sm:table-cell">
                  Series
                </th>
                <th className="px-3 py-2.5 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {insights.map((i) => {
                const spec = i.spec as TrendsQuery
                const label =
                  spec.series?.[0]?.label ??
                  spec.series?.[0]?.measure ??
                  "chart"
                return (
                  <tr
                    key={i.id}
                    className="transition-colors hover:bg-muted/30"
                  >
                    <td className="px-3 py-3 align-middle">
                      <div className="font-medium">{i.name}</div>
                      {i.description ? (
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {i.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="hidden px-3 py-3 align-middle text-xs text-muted-foreground sm:table-cell">
                      {spec.series?.length ?? 0} · {label}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          render={
                            <Link
                              to="/observe/projects/$projectId/trends"
                              params={{ projectId }}
                              search={{ insightId: i.id }}
                            />
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Delete ${i.name}`}
                          onClick={() => setDeleteId(i.id)}
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmActionDialog
        open={deleteId != null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null)
        }}
        title="Delete chart"
        description={
          deleting
            ? `Remove “${deleting.name}”? Boards that use this chart will show a missing widget.`
            : "Remove this chart?"
        }
        confirmLabel="Delete chart"
        onConfirm={async () => {
          if (!deleteId) return
          await client.observe.insights.delete({
            projectId,
            insightId: deleteId,
          })
          setInsights((rows) => rows.filter((r) => r.id !== deleteId))
          setDeleteId(null)
          await router.invalidate()
        }}
      />
    </ObserveProjectShell>
  )
}
