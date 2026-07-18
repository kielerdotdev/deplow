/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ContextBar } from "./context-bar"
import type { ObserveContext } from "@/lib/observe/context"

afterEach(() => {
  cleanup()
})

function baseContext(patch: Partial<ObserveContext> = {}): ObserveContext {
  return {
    time: { kind: "preset", preset: "1h" },
    baseline: { mode: "none" },
    filters: [],
    query: {},
    ...patch,
  }
}

describe("ContextBar", () => {
  it("toggles the advanced filter panel open and closed", () => {
    const onChange = vi.fn()
    render(
      <ContextBar
        context={baseContext()}
        onChange={onChange}
        surface="issues"
      />,
    )
    expect(screen.queryByTestId("advanced-filter-panel")).toBeNull()
    const toggle = screen.getByRole("button", { name: /filters/i })
    fireEvent.click(toggle)
    expect(screen.getByTestId("advanced-filter-panel")).toBeTruthy()
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    fireEvent.click(toggle)
    expect(screen.queryByTestId("advanced-filter-panel")).toBeNull()
  })

  it("adds a structured filter via the expanded panel", () => {
    const onChange = vi.fn()
    render(
      <ContextBar
        context={baseContext()}
        onChange={onChange}
        surface="issues"
        defaultExpanded
      />,
    )
    fireEvent.change(screen.getByLabelText("Filter key"), {
      target: { value: "level" },
    })
    fireEvent.change(screen.getByLabelText("Filter value"), {
      target: { value: "error" },
    })
    fireEvent.click(screen.getByRole("button", { name: /add filter/i }))
    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls.at(-1)?.[0] as ObserveContext
    expect(next.filters).toEqual([
      { key: "level", op: "eq", value: "error" },
    ])
  })

  it("shows active-filter summary chips and clear filters", () => {
    const onChange = vi.fn()
    render(
      <ContextBar
        context={baseContext({
          filters: [{ key: "level", op: "eq", value: "error" }],
          query: { errorsOnly: true },
        })}
        onChange={onChange}
        surface="issues"
      />,
    )
    expect(screen.getByTestId("active-filter-summary")).toBeTruthy()
    expect(screen.getByText("errors only")).toBeTruthy()
    fireEvent.click(screen.getByTestId("context-bar-clear-filters"))
    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls.at(-1)?.[0] as ObserveContext
    expect(next.filters).toEqual([])
    expect(next.query.errorsOnly).toBeUndefined()
  })

  it("removes a filter from the active summary", () => {
    const onChange = vi.fn()
    render(
      <ContextBar
        context={baseContext({
          filters: [{ key: "level", op: "eq", value: "error" }],
        })}
        onChange={onChange}
        surface="issues"
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /remove filter level/i }))
    const next = onChange.mock.calls.at(-1)?.[0] as ObserveContext
    expect(next.filters).toEqual([])
  })

  it("toggles Errors only inside the advanced panel on issues", () => {
    const onChange = vi.fn()
    render(
      <ContextBar
        context={baseContext()}
        onChange={onChange}
        surface="issues"
        defaultExpanded
      />,
    )
    const checkbox = screen.getByRole("checkbox", { name: /errors only/i })
    fireEvent.click(checkbox)
    const next = onChange.mock.calls.at(-1)?.[0] as ObserveContext
    expect(next.query.errorsOnly).toBe(true)
  })

  it("commits search through the query input", async () => {
    const onChange = vi.fn()
    render(
      <ContextBar
        context={baseContext()}
        onChange={onChange}
        surface="issues"
      />,
    )
    const input = screen.getByRole("textbox", { name: /search/i })
    fireEvent.change(input, { target: { value: "TypeError" } })
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
    const next = onChange.mock.calls.at(-1)?.[0] as ObserveContext
    expect(next.query.q).toBe("TypeError")
  })
})
