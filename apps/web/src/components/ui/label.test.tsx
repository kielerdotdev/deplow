/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Label } from "./label"

describe("Label", () => {
  it("is a defined forwardRef component and renders a native label", () => {
    expect(Label).toBeTruthy()
    expect(typeof Label).toBe("object") // forwardRef exotic
    render(
      <Label htmlFor="x" data-testid="lbl">
        Hello Label
      </Label>,
    )
    const el = screen.getByTestId("lbl")
    expect(el.tagName).toBe("LABEL")
    expect(el.getAttribute("for")).toBe("x")
    expect(el.textContent).toBe("Hello Label")
  })
})
