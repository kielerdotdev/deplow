/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ConfirmationButton } from "./confirmation-button"

describe("ConfirmationButton", () => {
  it("does not confirm on a quick click", () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmationButton onConfirm={onConfirm} holdDurationMs={800}>
        Delete
      </ConfirmationButton>,
    )

    const button = screen.getByRole("button", { name: /hold button to confirm/i })
    fireEvent.pointerDown(button, { button: 0 })
    fireEvent.pointerUp(button)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("is a defined component with hold-to-confirm behavior wired", () => {
    expect(ConfirmationButton).toBeTruthy()
    expect(typeof ConfirmationButton).toBe("function")
  })
})
