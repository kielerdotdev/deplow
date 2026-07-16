import {
  resolveBaselineRange,
  resolveTimeRange,
  type ObserveContext,
} from "@/lib/observe/context"

/** Build oRPC query input from Observe Context + projectId. */
export function contextToApiInput(
  projectId: string,
  ctx: ObserveContext,
  extras?: {
    durationMsMin?: number
    durationMsMax?: number
    statusError?: boolean
    useBaseline?: boolean
  },
) {
  const range = extras?.useBaseline
    ? resolveBaselineRange(ctx.baseline, resolveTimeRange(ctx.time))
    : resolveTimeRange(ctx.time)
  if (!range) {
    throw new Error("Baseline is not configured")
  }

  let durationMsMin = extras?.durationMsMin
  let durationMsMax = extras?.durationMsMax
  if (ctx.selection && !extras?.useBaseline) {
    durationMsMin = ctx.selection.yMin
    durationMsMax = ctx.selection.yMax
  }

  if (durationMsMin == null && ctx.query.minDurationMs != null) {
    durationMsMin = ctx.query.minDurationMs
  }

  return {
    projectId,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    service: ctx.query.service,
    operation: ctx.query.operation,
    release: ctx.query.release,
    environment: ctx.query.environment,
    q: ctx.query.q,
    filters: ctx.filters.map((f) => ({
      key: f.key,
      op: f.op,
      value: f.value,
    })),
    durationMsMin,
    durationMsMax,
    statusError: extras?.statusError ?? ctx.query.errorsOnly,
    // Root spans are the product default for investigation lists.
    spanScope: ctx.query.spanScope ?? "root",
  }
}

export function selectionApiInput(projectId: string, ctx: ObserveContext) {
  if (!ctx.selection) return null
  const selected = {
    ...contextToApiInput(projectId, {
      ...ctx,
      time: {
        kind: "absolute" as const,
        from: ctx.selection.timeFrom,
        to: ctx.selection.timeTo,
      },
    }),
    durationMsMin: ctx.selection.yMin,
    durationMsMax: ctx.selection.yMax,
  }
  const baseline =
    ctx.baseline.mode !== "none"
      ? contextToApiInput(projectId, ctx, { useBaseline: true })
      : null
  return { selected, baseline }
}
