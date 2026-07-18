/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ObserveEmptyState } from "./empty-state"

afterEach(() => {
  cleanup()
})

describe("ObserveEmptyState", () => {
  it("renders contextual no_match variant", () => {
    render(
      <ObserveEmptyState
        variant="no_match"
        title="No issues match the current filters"
        description="Clear filters to see results."
        action={<button type="button">Clear filters</button>}
      />,
    )
    expect(
      screen.getByTestId("observe-empty-state").getAttribute("data-variant"),
    ).toBe("no_match")
    expect(screen.getByText("No issues match the current filters")).toBeTruthy()
    expect(screen.getByRole("button", { name: /clear filters/i })).toBeTruthy()
  })

  it("renders no_unresolved defaults", () => {
    render(<ObserveEmptyState variant="no_unresolved" />)
    expect(screen.getByText("No unresolved issues")).toBeTruthy()
  })

  it("aligns to the page content grid (start, not modal center)", () => {
    const { container } = render(<ObserveEmptyState variant="empty" />)
    const root = container.querySelector("[data-testid=observe-empty-state]")
    expect(root?.className).toMatch(/items-start/)
    expect(root?.className).toMatch(/justify-start/)
    expect(root?.className).toMatch(/text-left/)
  })
})
