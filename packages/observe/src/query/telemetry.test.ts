import { describe, expect, it } from "vitest"

import {
  defaultTelemetryQuery,
  emptyFilterGroup,
  resolveTelemetryTimeRange,
  summarizeTelemetryQuery,
  telemetryToSpanFilter,
  telemetryToTrendsRun,
} from "./telemetry"

describe("telemetry query contract", () => {
  it("defaults root traces last 1h", () => {
    const q = defaultTelemetryQuery("traces")
    expect(q.scope).toBe("root")
    expect(q.presentation.view).toBe("traces")
    expect(q.timeRange).toEqual({ kind: "preset", preset: "1h" })
  })

  it("compiles filters into SpanFilter", () => {
    const q = defaultTelemetryQuery("traces")
    q.environment = ["production"]
    q.filter = emptyFilterGroup()
    q.filter.clauses = [
      { key: "service", op: "eq", value: "api" },
      { key: "http.status_code", op: "gte", value: "500" },
      { key: "status", op: "eq", value: "error" },
    ]
    const f = telemetryToSpanFilter("proj-1", q, new Date("2026-01-01T12:00:00Z"))
    expect(f.projectId).toBe("proj-1")
    expect(f.service).toBe("api")
    expect(f.environment).toBe("production")
    expect(f.statusError).toBe(true)
    expect(f.spanScope).toBe("root")
    expect(f.attributeFilters?.some((a) => a.key === "http.status_code")).toBe(
      true,
    )
  })

  it("compiles aggregations into TrendsQueryRun", () => {
    const q = defaultTelemetryQuery("traces")
    q.presentation.view = "timeseries"
    q.aggregation = { function: "p95", field: "duration", interval: "1m" }
    q.groupBy = ["service"]
    const run = telemetryToTrendsRun(q)
    expect(run.series[0]?.measure).toBe("p95")
    expect(run.series[0]?.signal).toBe("root_spans")
    expect(run.breakdowns[0]?.field).toBe("service")
    expect(run.interval).toBe("1m")
  })

  it("resolves presets to absolute bounds", () => {
    const now = new Date("2026-07-16T12:00:00Z")
    const { from, to } = resolveTelemetryTimeRange(
      { kind: "preset", preset: "1h" },
      now,
    )
    expect(to.toISOString()).toBe(now.toISOString())
    expect(to.getTime() - from.getTime()).toBe(3600_000)
  })

  it("summarizes in plain English", () => {
    const q = defaultTelemetryQuery("traces")
    q.environment = ["production"]
    q.filter.clauses = [{ key: "status", op: "eq", value: "error" }]
    q.presentation.view = "timeseries"
    q.aggregation = { function: "p95", field: "duration", interval: "1m" }
    q.groupBy = ["service"]
    const s = summarizeTelemetryQuery(q)
    expect(s).toMatch(/production/)
    expect(s).toMatch(/p95/)
    expect(s).toMatch(/service/)
  })
})
