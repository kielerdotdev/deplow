/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CodeSnippet } from "./code-snippet"

afterEach(() => {
  cleanup()
})

describe("CodeSnippet", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it("renders single language code", () => {
    render(<CodeSnippet language="Node.js" code="console.log(1)" />)
    expect(screen.getByText("Node.js")).toBeTruthy()
    expect(screen.getByText("console.log(1)")).toBeTruthy()
  })

  it("switches languages and copies active code", async () => {
    render(
      <CodeSnippet
        languages={[
          { id: "node", label: "Node.js", code: "node-code" },
          { id: "py", label: "Python", code: "py-code" },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole("tab", { name: "Python" }))
    expect(screen.getByText("py-code")).toBeTruthy()
    const buttons = screen.getAllByRole("button", { name: /copy code/i })
    fireEvent.click(buttons[0]!)
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("py-code")
    })
  })
})
