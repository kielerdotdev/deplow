import { useMemo } from "react"

import {
  FilterSection,
  SingleCheckboxFilter,
} from "@/components/observe/filter-section"
import {
  FilterSidebarBody,
  FilterSidebarFrame,
  FilterSidebarHeader,
} from "@/components/observe/filter-sidebar"
import { Separator } from "@/components/ui/separator"
import {
  resolveTimeRange,
  type ObserveContext,
} from "@/lib/observe/context"

type IssueLike = {
  level?: string | null
  culprit?: string | null
  title: string
  lastSeen?: string | null | Date
  firstSeen?: string | null | Date
}

export function IssuesFilterSidebar({
  issues,
  context,
  onChange,
}: {
  issues: ReadonlyArray<IssueLike>
  context: ObserveContext
  onChange: (next: ObserveContext) => void
}) {
  const levelOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const i of issues) {
      const level = (i.level ?? "unknown").toLowerCase()
      counts.set(level, (counts.get(level) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
  }, [issues])

  const selectedLevels = useMemo(() => {
    return context.filters
      .filter((f) => f.key === "level" && f.op === "eq" && f.value)
      .map((f) => f.value!)
  }, [context.filters])

  const hasErrorOnly = context.query.errorsOnly === true

  function setLevels(selected: string[]) {
    const others = context.filters.filter((f) => f.key !== "level")
    onChange({
      ...context,
      filters: [
        ...others,
        ...selected.map((value) => ({
          key: "level",
          op: "eq" as const,
          value,
        })),
      ],
    })
  }

  function clearAll() {
    onChange({
      ...context,
      filters: context.filters.filter((f) => f.key !== "level"),
      query: { ...context.query, errorsOnly: undefined },
    })
  }

  const canClear = selectedLevels.length > 0 || hasErrorOnly

  return (
    <div data-testid="issues-filter-sidebar">
      <FilterSidebarFrame>
        <FilterSidebarHeader canClear={canClear} onClear={clearAll} />
        <FilterSidebarBody>
          <SingleCheckboxFilter
            title="Errors only"
            checked={hasErrorOnly}
            onChange={(checked) =>
              onChange({
                ...context,
                query: {
                  ...context.query,
                  errorsOnly: checked ? true : undefined,
                },
              })
            }
          />
          <Separator className="my-2" />
          <FilterSection
            title="Level"
            options={levelOptions}
            selected={selectedLevels}
            onChange={setLevels}
          />
        </FilterSidebarBody>
      </FilterSidebarFrame>
    </div>
  )
}

function timestampToMs(value: string | Date | null | undefined): number | null {
  if (value == null) return null
  if (value instanceof Date) {
    const t = value.getTime()
    return Number.isFinite(t) ? t : null
  }
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : null
}

/** Apply issues sidebar filters + time range client-side. */
export function filterIssuesByContext<T extends IssueLike>(
  issues: T[],
  context: ObserveContext,
  now = Date.now(),
): T[] {
  const q = (context.query.q ?? "").trim().toLowerCase()
  const levels = new Set(
    context.filters
      .filter((f) => f.key === "level" && f.op === "eq" && f.value)
      .map((f) => f.value!.toLowerCase()),
  )
  const errorsOnly = context.query.errorsOnly === true
  const { from, to } = resolveTimeRange(context.time, now)
  const rangeStart = from.getTime()
  const rangeEnd = to.getTime()

  return issues.filter((i) => {
    const level = (i.level ?? "unknown").toLowerCase()
    if (levels.size > 0 && !levels.has(level)) return false
    if (
      errorsOnly &&
      level !== "error" &&
      level !== "fatal" &&
      level !== "critical"
    ) {
      return false
    }
    if (q) {
      const matchesText =
        i.title.toLowerCase().includes(q) ||
        (i.culprit?.toLowerCase().includes(q) ?? false) ||
        level.includes(q)
      if (!matchesText) return false
    }

    // Prefer last activity; fall back to first seen. Missing timestamps stay in range.
    const seen = timestampToMs(i.lastSeen) ?? timestampToMs(i.firstSeen)
    if (seen != null && (seen < rangeStart || seen > rangeEnd)) return false

    return true
  })
}

/** True when search / level / errors-only filters are set (time is separate). */
export function hasStructuredIssueFilters(context: ObserveContext): boolean {
  return (
    Boolean(context.query.q?.trim()) ||
    context.query.errorsOnly === true ||
    context.filters.some((f) => f.key === "level")
  )
}
