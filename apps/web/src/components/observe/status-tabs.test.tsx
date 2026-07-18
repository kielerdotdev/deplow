/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { StatusTabs } from "./status-tabs"

afterEach(() => {
  cleanup()
})

const TABS = [
  { value: "unresolved" as const, label: "Unresolved", count: 3 },
  { value: "resolved" as const, label: "Resolved", count: 1 },
  { value: "muted" as const, label: "Ignored", count: 0 },
]

describe("StatusTabs", () => {
  it("renders tabs with counts and selected state", () => {
    const onChange = vi.fn()
    render(
      <StatusTabs
        tabs={TABS}
        active="unresolved"
        onChange={onChange}
        totalCount={3}
        totalLabel="issues"
      />,
    )
    const unresolved = screen.getByTestId("status-tabs").querySelector(
      "#status-tab-unresolved",
    )
    expect(unresolved?.getAttribute("aria-selected")).toBe("true")
    expect(screen.getByTestId("status-tabs-total").textContent).toMatch(/3/)
    expect(screen.getByRole("tablist")).toBeTruthy()
  })

  it("switches on click", () => {
    const onChange = vi.fn()
    const { container } = render(
      <StatusTabs tabs={TABS} active="unresolved" onChange={onChange} />,
    )
    fireEvent.click(container.querySelector("#status-tab-resolved")!)
    expect(onChange).toHaveBeenCalledWith("resolved")
  })

  it("supports arrow key navigation", () => {
    const onChange = vi.fn()
    const { container } = render(
      <StatusTabs tabs={TABS} active="unresolved" onChange={onChange} />,
    )
    const tab = container.querySelector("#status-tab-unresolved")!
    fireEvent.keyDown(tab, { key: "ArrowRight" })
    expect(onChange).toHaveBeenCalledWith("resolved")
  })
})
