import { describe, expect, it } from "vitest"

import { alertPreviewQuery, extractPreviewValue } from "./alert-preview"

describe("alertPreviewQuery", () => {
  it("builds timeseries query for error_rate", () => {
    const q = alertPreviewQuery({ metric: "error_rate", window: "5m" })
    expect(q.presentation.view).toBe("timeseries")
    expect(q.aggregation?.function).toBe("error_rate")
    expect(q.timeRange.kind).toBe("absolute")
  })

  it("extracts latest point average", () => {
    const v = extractPreviewValue({
      kind: "timeseries",
      trends: {
        points: [
          { values: { A: 1 } },
          { values: { A: 4, B: 6 } },
        ],
      },
    })
    expect(v).toBe(5)
  })
})
