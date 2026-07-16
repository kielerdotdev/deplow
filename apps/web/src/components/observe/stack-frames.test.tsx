/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  parseExceptionFrames,
  StackFramesView,
} from "./stack-frames"

describe("parseExceptionFrames", () => {
  it("returns newest frame first and keeps in_app", () => {
    const frames = parseExceptionFrames(
      JSON.stringify({
        values: [
          {
            stacktrace: {
              frames: [
                { filename: "lib.js", function: "lib", in_app: false },
                { filename: "app.ts", function: "main", lineno: 12, in_app: true },
              ],
            },
          },
        ],
      }),
    )
    expect(frames[0]?.function).toBe("main")
    expect(frames[0]?.in_app).toBe(true)
    expect(frames[1]?.function).toBe("lib")
  })

  it("handles bad json", () => {
    expect(parseExceptionFrames("{")).toEqual([])
  })
})

describe("StackFramesView", () => {
  it("renders empty state", () => {
    render(<StackFramesView frames={[]} emptyMessage="Nothing here" />)
    expect(screen.getByText("Nothing here")).toBeTruthy()
  })

  it("highlights in-app frames", () => {
    render(
      <StackFramesView
        frames={[
          { function: "main", filename: "app.ts", lineno: 1, in_app: true },
          { function: "lib", filename: "node_modules/x.js", in_app: false },
        ]}
      />,
    )
    expect(screen.getByTestId("stack-frames")).toBeTruthy()
    expect(screen.getAllByTestId("frame-in-app")).toHaveLength(1)
    expect(screen.getAllByTestId("frame-lib")).toHaveLength(1)
    expect(screen.getByText(/main/)).toBeTruthy()
    expect(screen.getByText(/app\.ts:1/)).toBeTruthy()
  })
})
