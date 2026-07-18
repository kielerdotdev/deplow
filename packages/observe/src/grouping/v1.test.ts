import { describe, expect, it } from "vitest"

import { groupEvent, normalizeMessage } from "./v1"

describe("normalizeMessage", () => {
  it("strips uuids hex and long numbers", () => {
    const out = normalizeMessage(
      "user 12345 failed uuid 550e8400-e29b-41d4-a716-446655440000 key deadbeefdeadbeefdeadbeefdeadbeef",
    )
    expect(out).toContain("<uuid>")
    expect(out).toContain("<num>")
    expect(out).toContain("<hex>")
  })
})

describe("groupEvent", () => {
  it("uses exception type and normalized value", () => {
    const g = groupEvent({
      level: "error",
      platform: "node",
      exception: {
        values: [{ type: "Error", value: "timeout after 9999ms" }],
      },
    })
    expect(g.mechanism).toBe("hostrig-v1")
    expect(g.groupingKey).toContain("Error:")
    expect(g.groupingKey).toContain("<num>")
    expect(g.title).toContain("Error:")
  })

  it("honors custom fingerprint", () => {
    const g = groupEvent({
      fingerprint: ["db-down"],
      message: "connection refused",
    })
    expect(g.groupingKey).toBe("db-down")
    expect(g.fingerprint).toEqual(["db-down"])
  })

  it("expands {{ default }} in fingerprint", () => {
    const g = groupEvent({
      fingerprint: ["{{ default }}", "region"],
      exception: { values: [{ type: "E", value: "x" }] },
    })
    expect(g.groupingKey).toContain("E:")
    expect(g.groupingKey).toContain("region")
  })

  it("does not include transaction in grouping key", () => {
    const a = groupEvent({
      transaction: "/a",
      exception: { values: [{ type: "E", value: "same" }] },
    })
    const b = groupEvent({
      transaction: "/b",
      exception: { values: [{ type: "E", value: "same" }] },
    })
    expect(a.groupingKeyHash).toBe(b.groupingKeyHash)
  })

  it("extracts trace id and culprit from frames", () => {
    const g = groupEvent({
      contexts: { trace: { trace_id: "abc" } },
      exception: {
        values: [
          {
            type: "TypeError",
            value: "x",
            stacktrace: {
              frames: [
                { filename: "node_modules/x.js", function: "lib", in_app: false },
                { filename: "app.ts", function: "main", lineno: 10, in_app: true },
              ],
            },
          },
        ],
      },
    })
    expect(g.traceId).toBe("abc")
    expect(g.culprit).toContain("app.ts")
    expect(g.culprit).toContain("main")
  })

  it("falls back to message", () => {
    const g = groupEvent({ message: "plain log line 1234" })
    expect(g.groupingKey).toContain("<num>")
    expect(g.title).toContain("plain log")
  })
})
