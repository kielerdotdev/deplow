import {
  baselineSpecSchema,
  contextSchema,
  filterClauseSchema,
  querySpecSchema,
  selectionSchema,
  type BaselineSpec,
  type FilterClause,
  type ObserveContext,
  type QuerySpec,
  type Selection,
  type TimePreset,
  type TimeRange,
} from "./types"

/** Compact URL search-param keys (no secrets). */
const KEYS = {
  preset: "t",
  from: "from",
  to: "to",
  baseline: "bl",
  blFrom: "blFrom",
  blTo: "blTo",
  filters: "f",
  q: "q",
  service: "svc",
  operation: "op",
  traceId: "tid",
  spanId: "sid",
  release: "rel",
  environment: "env",
  selection: "sel",
  tab: "tab",
} as const

function encodeFilters(filters: FilterClause[]): string | undefined {
  if (filters.length === 0) return undefined
  return filters
    .map((f) => {
      const v = f.value ?? ""
      return `${encodeURIComponent(f.key)}:${f.op}:${encodeURIComponent(v)}`
    })
    .join("|")
}

function decodeFilters(raw: unknown): FilterClause[] {
  if (typeof raw !== "string" || !raw.trim()) return []
  const out: FilterClause[] = []
  for (const part of raw.split("|")) {
    const [keyEnc, op, ...rest] = part.split(":")
    if (!keyEnc || !op) continue
    const value = rest.join(":")
    const parsed = filterClauseSchema.safeParse({
      key: decodeURIComponent(keyEnc),
      op,
      value: value ? decodeURIComponent(value) : undefined,
    })
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

function encodeSelection(sel: Selection | undefined): string | undefined {
  if (!sel) return undefined
  return [
    sel.timeFrom,
    sel.timeTo,
    String(sel.yMin),
    String(sel.yMax),
    sel.yAxis,
  ].join(",")
}

function decodeSelection(raw: unknown): Selection | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined
  const [timeFrom, timeTo, yMin, yMax, yAxis] = raw.split(",")
  const parsed = selectionSchema.safeParse({
    timeFrom,
    timeTo,
    yMin: Number(yMin),
    yMax: Number(yMax),
    yAxis: yAxis === "error" ? "error" : "duration_ms",
  })
  return parsed.success ? parsed.data : undefined
}

export type ContextSearchParams = Record<string, unknown>

/** Serialize Context → router search object (omit defaults). */
export function serializeContext(
  ctx: ObserveContext,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}

  if (ctx.time.kind === "preset") {
    if (ctx.time.preset !== "1h") out[KEYS.preset] = ctx.time.preset
  } else {
    out[KEYS.from] = ctx.time.from
    out[KEYS.to] = ctx.time.to
  }

  if (ctx.baseline.mode === "previous") {
    out[KEYS.baseline] = "prev"
  } else if (ctx.baseline.mode === "absolute") {
    out[KEYS.baseline] = "abs"
    out[KEYS.blFrom] = ctx.baseline.from
    out[KEYS.blTo] = ctx.baseline.to
  }

  const f = encodeFilters(ctx.filters)
  if (f) out[KEYS.filters] = f

  const q = ctx.query
  if (q.q) out[KEYS.q] = q.q
  if (q.service) out[KEYS.service] = q.service
  if (q.operation) out[KEYS.operation] = q.operation
  if (q.traceId) out[KEYS.traceId] = q.traceId
  if (q.spanId) out[KEYS.spanId] = q.spanId
  if (q.release) out[KEYS.release] = q.release
  if (q.environment) out[KEYS.environment] = q.environment

  const sel = encodeSelection(ctx.selection)
  if (sel) out[KEYS.selection] = sel
  if (ctx.tab) out[KEYS.tab] = ctx.tab

  return out
}

/** Parse router search → Context (tolerant). */
export function parseContext(search: ContextSearchParams): ObserveContext {
  let time: TimeRange = { kind: "preset", preset: "1h" }
  if (typeof search[KEYS.from] === "string" && typeof search[KEYS.to] === "string") {
    time = {
      kind: "absolute",
      from: search[KEYS.from] as string,
      to: search[KEYS.to] as string,
    }
  } else if (typeof search[KEYS.preset] === "string") {
    time = {
      kind: "preset",
      preset: search[KEYS.preset] as TimePreset,
    }
  }

  let baseline: BaselineSpec = { mode: "none" }
  const bl = search[KEYS.baseline]
  if (bl === "prev") {
    baseline = { mode: "previous" }
  } else if (
    bl === "abs" &&
    typeof search[KEYS.blFrom] === "string" &&
    typeof search[KEYS.blTo] === "string"
  ) {
    baseline = {
      mode: "absolute",
      from: search[KEYS.blFrom] as string,
      to: search[KEYS.blTo] as string,
    }
  }

  const query: QuerySpec = {
    q: typeof search[KEYS.q] === "string" ? (search[KEYS.q] as string) : undefined,
    service:
      typeof search[KEYS.service] === "string"
        ? (search[KEYS.service] as string)
        : undefined,
    operation:
      typeof search[KEYS.operation] === "string"
        ? (search[KEYS.operation] as string)
        : undefined,
    traceId:
      typeof search[KEYS.traceId] === "string"
        ? (search[KEYS.traceId] as string)
        : undefined,
    spanId:
      typeof search[KEYS.spanId] === "string"
        ? (search[KEYS.spanId] as string)
        : undefined,
    release:
      typeof search[KEYS.release] === "string"
        ? (search[KEYS.release] as string)
        : undefined,
    environment:
      typeof search[KEYS.environment] === "string"
        ? (search[KEYS.environment] as string)
        : undefined,
  }

  const tabRaw = search[KEYS.tab]
  const tab =
    typeof tabRaw === "string" &&
    [
      "root_spans",
      "anomalies",
      "traces",
      "logs",
      "database",
      "external",
    ].includes(tabRaw)
      ? (tabRaw as ObserveContext["tab"])
      : undefined

  const draft = {
    time,
    baseline,
    filters: decodeFilters(search[KEYS.filters]),
    query,
    selection: decodeSelection(search[KEYS.selection]),
    tab,
  }

  const parsed = contextSchema.safeParse(draft)
  if (parsed.success) return parsed.data

  // Fallback: coerce with defaults if absolute ISO dates failed validation
  return contextSchema.parse({
    time: { kind: "preset", preset: "1h" },
    baseline: baselineSpecSchema.catch({ mode: "none" }).parse(baseline),
    filters: draft.filters,
    query: querySpecSchema.parse(query),
    selection: draft.selection,
    tab,
  })
}

/** Zod schema for TanStack Router validateSearch. */
export const contextSearchSchema = {
  parse(search: Record<string, unknown>): Record<string, string | undefined> {
    const ctx = parseContext(search)
    return serializeContext(ctx)
  },
}

export function mergeContext(
  base: ObserveContext,
  patch: Partial<ObserveContext>,
): ObserveContext {
  return contextSchema.parse({
    ...base,
    ...patch,
    query: { ...base.query, ...patch.query },
    filters: patch.filters ?? base.filters,
  })
}

export function contextToQueryString(ctx: ObserveContext): string {
  const params = serializeContext(ctx)
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, v)
  }
  return sp.toString()
}
