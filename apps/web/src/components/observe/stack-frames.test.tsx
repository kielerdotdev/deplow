/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

afterEach(() => cleanup())

import {
  ExceptionChainView,
  parseExceptionChain,
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

describe("parseExceptionChain", () => {
  it("returns nested exception values", () => {
    const chain = parseExceptionChain(
      JSON.stringify({
        values: [
          { type: "RuntimeError", value: "outer" },
          { type: "TimeoutError", value: "inner" },
        ],
      }),
    )
    expect(chain).toHaveLength(2)
    expect(chain[1]?.type).toBe("TimeoutError")
  })
})

describe("ExceptionChainView", () => {
  it("renders exception types", () => {
    render(
      <ExceptionChainView
        exceptionJson={JSON.stringify({
          values: [
            {
              type: "TypeError",
              value: "boom",
              stacktrace: {
                frames: [
                  { function: "main", filename: "app.ts", in_app: true },
                ],
              },
            },
          ],
        })}
      />,
    )
    expect(screen.getByTestId("exception-chain")).toBeTruthy()
    expect(screen.getByText(/TypeError/)).toBeTruthy()
    expect(screen.getByText(/boom/)).toBeTruthy()
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
