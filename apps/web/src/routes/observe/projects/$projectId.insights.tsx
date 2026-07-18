import { useEffect, useState } from "react"
import {
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { ChartLineIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { ConfirmActionDialog } from "@/components/confirm-action-dialog"
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
import { ChartBuilderDialog } from "@/components/observe/trends/chart-builder-dialog"
import type { ChartInsightMeta } from "@/components/observe/trends/chart-builder"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/auth.functions"
import {
  defaultTrendsQuery,
  parseTrendsQuery,
  type TrendsQuery,
} from "@/lib/observe/trends"
import { client } from "@/lib/orpc"

type InsightRow = Awaited<
  ReturnType<typeof client.observe.insights.list>
>[number]

/** All fields optional so Links to this route do not require search. */
export type InsightsSearch = {
  /** Open create dialog (from redirects / deep links). */
  new?: boolean
  /** Open edit dialog for this saved chart. */
  insightId?: string
  /** Prefill Trends query when creating (serialized via tq). */
  tq?: string
}

function parseInsightsSearch(search: Record<string, unknown>): InsightsSearch {
  const out: InsightsSearch = {}
  if (search.new === true || search.new === "1" || search.new === "true") {
    out.new = true
  }
  if (typeof search.insightId === "string" && search.insightId) {
    out.insightId = search.insightId
  }
  if (typeof search.tq === "string" && search.tq) {
    out.tq = search.tq
  }
  return out
}

export const Route = createFileRoute("/observe/projects/$projectId/insights")({
  validateSearch: (search): InsightsSearch =>
    parseInsightsSearch(search as Record<string, unknown>),
  loader: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    await client.observe.projects.enable({ projectId: params.projectId }).catch(
      () => null,
    )
    const [project, insights, alerts] = await Promise.all([
      client.projects.get({ id: params.projectId }),
      client.observe.insights
        .list({ projectId: params.projectId })
        .catch(() => [] as InsightRow[]),
      client.observe.alerts
        .list({ projectId: params.projectId })
        .catch(() => []),
    ])
    return { project, insights, alertCount: alerts.length }
  },
  component: InsightsPage,
})

function InsightsPage() {
  const { project, insights: initial, alertCount } = Route.useLoaderData()
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const [insights, setInsights] = useState(initial)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<{
    meta: ChartInsightMeta
    query: TrendsQuery
  } | null>(null)

  useEffect(() => {
    setInsights(initial)
  }, [initial])

  // Deep-link: ?new=1 opens create; ?insightId= opens edit.
  useEffect(() => {
    if (search.new) {
      setCreateOpen(true)
      setEditing(null)
      return
    }
    if (search.insightId) {
      const row = insights.find((i) => i.id === search.insightId)
      if (row) {
        setEditing({
          meta: {
            id: row.id,
            name: row.name,
            description: row.description,
          },
          query: row.spec as TrendsQuery,
        })
        setCreateOpen(false)
      }
    }
  }, [search.new, search.insightId, insights])

  const deleting = insights.find((i) => i.id === deleteId)

  const createInitialQuery = search.tq
    ? parseTrendsQuery({ tq: search.tq })
    : defaultTrendsQuery()

  function clearBuilderSearch() {
    void navigate({
      search: {},
      replace: true,
    })
  }

  function openCreate() {
    setEditing(null)
    setCreateOpen(true)
    void navigate({
      search: { new: true },
      replace: true,
    })
  }

  function openEdit(row: InsightRow) {
    setCreateOpen(false)
    setEditing({
      meta: {
        id: row.id,
        name: row.name,
        description: row.description,
      },
      query: row.spec as TrendsQuery,
    })
    void navigate({
      search: { insightId: row.id },
      replace: true,
    })
  }

  function handleSaved(saved: ChartInsightMeta) {
    setInsights((rows) => {
      const idx = rows.findIndex((r) => r.id === saved.id)
      if (idx >= 0) {
        const next = [...rows]
        next[idx] = {
          ...next[idx]!,
          name: saved.name,
          description: saved.description,
        }
        return next
      }
      // Optimistic row until invalidate reloads full list.
      return [
        {
          ...({
            id: saved.id,
            name: saved.name,
            description: saved.description,
            spec: createInitialQuery,
          } as InsightRow),
        },
        ...rows,
      ]
    })
    void router.invalidate()
  }

  return (
    <ObserveProjectShell
      projectId={projectId}
      title="Charts"
      description={`Saved queries for ${project.name} · boards & alerts`}
      actions={
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <PlusIcon className="size-3.5" />
          Create chart
        </Button>
      }
    >
      {insights.length === 0 ? (
        <ObserveEmptyState
          icon={ChartLineIcon}
          title="No charts yet"
          description="Build a Trends query, save it, then drop it on boards or attach alerts."
          action={
            <Button size="sm" onClick={openCreate}>
              <PlusIcon className="size-3.5" />
              Create chart
            </Button>
          }
        />
      ) : (
        <ResourceTable>
          <ResourceTableHead>
            <ResourceTh>Name</ResourceTh>
            <ResourceTh className="hidden sm:table-cell">Series</ResourceTh>
            <ResourceTh className="hidden md:table-cell">Viz</ResourceTh>
            <ResourceTh srOnly>Actions</ResourceTh>
          </ResourceTableHead>
          <ResourceTableBody>
            {insights.map((i) => {
              const spec = i.spec as TrendsQuery
              const label =
                spec.series?.[0]?.label ??
                spec.series?.[0]?.measure ??
                "chart"
              const viz = spec.viz?.kind?.replaceAll("_", " ") ?? "line"
              return (
                <ResourceRow key={i.id} onClick={() => openEdit(i)}>
                  <ResourceTd>
                    <div className="font-medium leading-snug">{i.name}</div>
                    {i.description ? (
                      <div className="mt-0.5 max-w-md truncate text-xs text-muted-foreground">
                        {i.description}
                      </div>
                    ) : (
                      <div className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                        {spec.series?.length ?? 0} series · {label}
                      </div>
                    )}
                  </ResourceTd>
                  <ResourceTd className="hidden text-xs tabular-nums text-muted-foreground sm:table-cell">
                    {spec.series?.length ?? 0} · {label}
                  </ResourceTd>
                  <ResourceTd className="hidden capitalize text-xs text-muted-foreground md:table-cell">
                    {viz}
                  </ResourceTd>
                  <ResourceTd stopPropagation className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        onClick={() => openEdit(i)}
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
                  </ResourceTd>
                </ResourceRow>
              )
            })}
          </ResourceTableBody>
        </ResourceTable>
      )}

      <ChartBuilderDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) clearBuilderSearch()
        }}
        projectId={projectId}
        initialQuery={createInitialQuery}
        alertCount={alertCount}
        onSaved={handleSaved}
      />

      <ChartBuilderDialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null)
            clearBuilderSearch()
          }
        }}
        projectId={projectId}
        insight={editing?.meta}
        initialQuery={editing?.query}
        alertCount={alertCount}
        onSaved={(saved) => {
          handleSaved(saved)
          setEditing((prev) =>
            prev
              ? {
                  ...prev,
                  meta: saved,
                }
              : null,
          )
        }}
      />

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
