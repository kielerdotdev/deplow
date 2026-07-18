/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CopyableField } from "./copyable-field"

afterEach(() => {
  cleanup()
})

describe("CopyableField", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it("renders label and value", () => {
    render(<CopyableField label="SENTRY_DSN" value="https://example/dsn" />)
    expect(screen.getByText("SENTRY_DSN")).toBeTruthy()
    expect(screen.getByText("https://example/dsn")).toBeTruthy()
  })

  it("copies value and announces confirmation", async () => {
    render(<CopyableField label="SENTRY_DSN" value="https://example/dsn" />)
    const buttons = screen.getAllByRole("button", { name: /copy sentry_dsn/i })
    fireEvent.click(buttons[0]!)
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "https://example/dsn",
      )
    })
    await waitFor(() => {
      expect(screen.getByText(/copied to clipboard/i)).toBeTruthy()
    })
  })
})
