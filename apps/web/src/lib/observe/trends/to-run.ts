import type { TrendsQuery } from "./types"
import type { TrendsQueryRun } from "@deplow/observe"

/** Map web TrendsQuery → package runner input. */
export function toTrendsQueryRun(q: TrendsQuery): TrendsQueryRun {
  return {
    analysis: q.analysis,
    series: q.series.map((s) => ({
      id: s.id,
      letter: s.letter,
      label: s.label,
      signal: s.signal,
      measure: s.measure,
      field: s.field,
      filters: s.filters,
      color: s.color,
      hidden: s.hidden,
    })),
    formulas: q.formulas.map((f) => ({
      id: f.id,
      letter: f.letter,
      label: f.label,
      expr: f.expr,
      unit: f.unit,
      color: f.color,
      hidden: f.hidden,
    })),
    filters: q.filters,
    breakdowns: q.breakdowns.map((b) => ({
      field: b.field,
      topN: b.topN,
      rankBy: b.rankBy,
      otherBucket: b.otherBucket,
    })),
    interval: q.interval,
    baseline: q.baseline,
    viz: {
      kind: q.viz.kind,
      options: q.viz.options
        ? {
            unit: q.viz.options.unit,
            stacked: q.viz.options.stacked,
            fill: q.viz.options.fill,
          }
        : undefined,
    },
    excludeInternal: q.excludeInternal,
  }
}
