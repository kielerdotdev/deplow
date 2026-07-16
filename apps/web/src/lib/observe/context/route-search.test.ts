import { describe, expect, it } from "vitest"

import { contextSchema } from "./types"
import {
  serializeIssueSearch,
  serializeIssuesListSearch,
  serializeLogsSearch,
  serializeTraceSearch,
} from "./route-search"

describe("route search helpers", () => {
  const ctx = contextSchema.parse({})

  it("always includes event key for issue links", () => {
    const withEvent = serializeIssueSearch(ctx, "abc")
    expect(withEvent.event).toBe("abc")
    const without = serializeIssueSearch(ctx)
    expect("event" in without).toBe(true)
    expect(without.event).toBeUndefined()
  })

  it("always includes span key for trace links", () => {
    const withSpan = serializeTraceSearch(ctx, "span-1")
    expect(withSpan.span).toBe("span-1")
    const without = serializeTraceSearch(ctx)
    expect("span" in without).toBe(true)
    expect(without.span).toBeUndefined()
  })

  it("serializes log and inspect drawer keys", () => {
    const logs = serializeLogsSearch(ctx, "row-1")
    expect(logs.log).toBe("row-1")
    const issues = serializeIssuesListSearch(ctx, "unresolved", "iss-1")
    expect(issues.status).toBe("unresolved")
    expect(issues.inspect).toBe("iss-1")
  })
})
