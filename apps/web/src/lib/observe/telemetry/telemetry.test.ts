import { describe, expect, it } from "vitest"

import {
  contextToTelemetryQuery,
  defaultTelemetryQuery,
  parseStoredQuery,
  parseTelemetryQuery,
  serializeTelemetryQuery,
  summarizeTelemetryQuery,
  telemetryQuerySchema,
} from "./index"

describe("TelemetryQuery", () => {
  it("defaults to root traces last 1h", () => {
    const q = defaultTelemetryQuery("traces")
    expect(q.version).toBe(1)
    expect(q.signal).toBe("traces")
    expect(q.scope).toBe("root")
    expect(q.presentation.view).toBe("traces")
    expect(q.timeRange).toEqual({ kind: "preset", preset: "1h" })
  })

  it("round-trips through URL encoding", () => {
    const q = defaultTelemetryQuery("traces")
    q.filter.clauses.push({
      key: "service",
      op: "eq",
      value: "frontend",
    })
    const search = serializeTelemetryQuery(q)
    const parsed = parseTelemetryQuery(search)
    expect(parsed.filter.clauses[0]?.value).toBe("frontend")
    expect(parsed.scope).toBe("root")
  })

  it("migrates ObserveContext filters", () => {
    const tq = contextToTelemetryQuery({
      time: { kind: "preset", preset: "6h" },
      baseline: { mode: "none" },
      filters: [{ key: "http.status_code", op: "gte", value: "500" }],
      query: {
        service: "api",
        spanScope: "entrypoint",
        errorsOnly: true,
        environment: "production",
      },
    })
    expect(tq.timeRange).toEqual({ kind: "preset", preset: "6h" })
    expect(tq.scope).toBe("entrypoint")
    expect(tq.environment).toEqual(["production"])
    expect(tq.filter.clauses.some((c) => c.key === "service")).toBe(true)
    expect(tq.filter.clauses.some((c) => c.key === "status")).toBe(true)
  })

  it("summarizes aggregations in plain English", () => {
    const q = telemetryQuerySchema.parse({
      ...defaultTelemetryQuery(),
      environment: ["production"],
      filter: {
        id: "root",
        mode: "and",
        clauses: [{ key: "status", op: "eq", value: "error" }],
        groups: [],
      },
      aggregation: { function: "p95", field: "duration", interval: "1m" },
      groupBy: ["service"],
      presentation: { view: "timeseries", sort: "newest" },
    })
    const s = summarizeTelemetryQuery(q)
    expect(s).toContain("production")
    expect(s).toContain("p95")
    expect(s).toContain("service")
  })

  it("parses stored trendsQuery wrapper", () => {
    const q = parseStoredQuery({
      trendsQuery: {
        version: 1,
        analysis: "trends",
        series: [
          {
            id: "1",
            letter: "A",
            signal: "root_spans",
            measure: "error_rate",
            filters: [],
          },
        ],
        formulas: [],
        filters: { id: "root", mode: "and", clauses: [], groups: [] },
        breakdowns: [],
        time: { kind: "preset", preset: "1h" },
        interval: "auto",
        baseline: { mode: "none" },
        viz: { kind: "line", referenceLines: [] },
      },
    })
    expect(q.signal).toBe("traces")
    expect(q.aggregation?.function).toBe("error_rate")
  })
})
