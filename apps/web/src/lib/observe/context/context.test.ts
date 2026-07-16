import { describe, expect, it } from "vitest"

import {
  contextToQueryString,
  mergeContext,
  parseContext,
  resolveBaselineRange,
  resolveTimeRange,
  serializeContext,
  type ObserveContext,
} from "./index"

describe("Observe Context URL", () => {
  it("round-trips default context to empty-ish params", () => {
    const ctx: ObserveContext = {
      time: { kind: "preset", preset: "1h" },
      baseline: { mode: "none" },
      filters: [],
      query: {},
    }
    const serialized = serializeContext(ctx)
    expect(serialized.t).toBeUndefined()
    expect(serialized.bl).toBeUndefined()
    const parsed = parseContext(serialized)
    expect(parsed.time).toEqual({ kind: "preset", preset: "1h" })
    expect(parsed.baseline).toEqual({ mode: "none" })
  })

  it("serializes presets, baseline previous, filters, and selection", () => {
    const ctx: ObserveContext = {
      time: { kind: "preset", preset: "7d" },
      baseline: { mode: "previous" },
      filters: [
        { key: "http.status_code", op: "eq", value: "500" },
        { key: "deployment.environment", op: "eq", value: "prod" },
      ],
      query: { service: "checkout", q: "POST /pay" },
      selection: {
        timeFrom: "2026-07-15T10:00:00.000Z",
        timeTo: "2026-07-15T10:30:00.000Z",
        yMin: 200,
        yMax: 2000,
        yAxis: "duration_ms",
      },
      tab: "anomalies",
    }
    const s = serializeContext(ctx)
    expect(s.t).toBe("7d")
    expect(s.bl).toBe("prev")
    expect(s.svc).toBe("checkout")
    expect(s.q).toBe("POST /pay")
    expect(s.f).toContain("http.status_code:eq:500")
    expect(s.tab).toBe("anomalies")
    expect(s.sel).toContain("2026-07-15T10:00:00.000Z")

    const back = parseContext(s)
    expect(back.time).toEqual(ctx.time)
    expect(back.baseline).toEqual(ctx.baseline)
    expect(back.query.service).toBe("checkout")
    expect(back.filters).toHaveLength(2)
    expect(back.selection?.yMin).toBe(200)
    expect(back.tab).toBe("anomalies")
  })

  it("builds stable query strings for deep links", () => {
    const qs = contextToQueryString({
      time: { kind: "preset", preset: "24h" },
      baseline: { mode: "none" },
      filters: [],
      query: { service: "api" },
    })
    expect(qs).toContain("t=24h")
    expect(qs).toContain("svc=api")
  })

  it("round-trips trace scope, errors-only, and min duration", () => {
    const ctx: ObserveContext = {
      time: { kind: "preset", preset: "1h" },
      baseline: { mode: "none" },
      filters: [],
      query: {
        spanScope: "root",
        errorsOnly: true,
        minDurationMs: 500,
      },
    }
    const s = serializeContext(ctx)
    // root is the default — omitted from the URL
    expect(s.scope).toBeUndefined()
    expect(s.err).toBe("1")
    expect(s.dmin).toBe("500")
    const back = parseContext(s)
    expect(back.query.spanScope).toBeUndefined()
    expect(back.query.errorsOnly).toBe(true)
    expect(back.query.minDurationMs).toBe(500)

    const entry = serializeContext({
      ...ctx,
      query: { ...ctx.query, spanScope: "entrypoint" },
    })
    expect(entry.scope).toBe("entrypoint")
    expect(parseContext(entry).query.spanScope).toBe("entrypoint")
  })

  it("resolves baseline previous window", () => {
    const current = resolveTimeRange({ kind: "preset", preset: "1h" }, Date.parse("2026-07-15T12:00:00Z"))
    const bl = resolveBaselineRange({ mode: "previous" }, current)
    expect(bl).not.toBeNull()
    expect(bl!.to.getTime()).toBe(current.from.getTime())
    expect(bl!.to.getTime() - bl!.from.getTime()).toBe(
      current.to.getTime() - current.from.getTime(),
    )
  })

  it("mergeContext patches query without dropping filters", () => {
    const base: ObserveContext = {
      time: { kind: "preset", preset: "1h" },
      baseline: { mode: "none" },
      filters: [{ key: "a", op: "eq", value: "1" }],
      query: { service: "a" },
    }
    const next = mergeContext(base, { query: { operation: "GET /" } })
    expect(next.query.service).toBe("a")
    expect(next.query.operation).toBe("GET /")
    expect(next.filters).toHaveLength(1)
  })
})
