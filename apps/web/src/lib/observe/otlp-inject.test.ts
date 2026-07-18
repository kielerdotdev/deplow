import { describe, expect, it } from "vitest"

import { injectProjectIdIntoOtlpJson } from "./otlp-inject"

describe("injectProjectIdIntoOtlpJson", () => {
  it("injects hostrig.project_id into resourceSpans", () => {
    const body = Buffer.from(
      JSON.stringify({
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: "service.name", value: { stringValue: "web" } },
              ],
            },
            scopeSpans: [],
          },
        ],
      }),
    )
    const out = injectProjectIdIntoOtlpJson(
      body,
      "application/json",
      "proj-1",
    )
    const parsed = JSON.parse(out.toString("utf8")) as {
      resourceSpans: Array<{
        resource: { attributes: Array<{ key: string; value: { stringValue: string } }> }
      }>
    }
    const attrs = parsed.resourceSpans[0]!.resource.attributes
    expect(attrs.some((a) => a.key === "hostrig.project_id")).toBe(true)
    expect(
      attrs.find((a) => a.key === "hostrig.project_id")?.value.stringValue,
    ).toBe("proj-1")
    // Legacy attr for older ClickHouse MVs during rebrand window
    expect(
      attrs.find((a) => a.key === "deplow.project_id")?.value.stringValue,
    ).toBe("proj-1")
  })

  it("leaves protobuf bodies alone", () => {
    const body = Buffer.from([0x0a, 0x01, 0x02])
    expect(
      injectProjectIdIntoOtlpJson(body, "application/x-protobuf", "p"),
    ).toEqual(body)
  })
})
