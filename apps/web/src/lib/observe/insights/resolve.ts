import type { ObserveContext } from "@/lib/observe/context"
import type { InsightGroupBy, InsightSpec } from "./types"

/** Merge dashboard breakdown override onto an insight spec. */
export function resolveInsightSpec(
  spec: InsightSpec,
  opts?: {
    context?: ObserveContext
    groupByOverride?: string | null
  },
): InsightSpec & { effectiveBreakdown?: string } {
  const breakdownField =
    opts?.groupByOverride === null
      ? undefined
      : (opts?.groupByOverride ?? spec.breakdown?.field)

  return {
    ...spec,
    breakdown: breakdownField
      ? {
          field: breakdownField,
          topN: spec.breakdown?.topN ?? 8,
        }
      : undefined,
    effectiveBreakdown: breakdownField,
  }
}

/** @deprecated alias */
export type { InsightGroupBy }
