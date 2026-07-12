/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { StatusBadge } from "./status-badge"

describe("StatusBadge", () => {
  it("renders the provided status label", () => {
    render(<StatusBadge status="ready" />)
    expect(screen.getByText("ready")).toBeTruthy()
  })

  it("maps running to online", () => {
    render(<StatusBadge status="running" />)
    expect(screen.getByText("online")).toBeTruthy()
  })

  it("renders failed status", () => {
    render(<StatusBadge status="failed" />)
    expect(screen.getByText("failed")).toBeTruthy()
  })

  it("renders degraded status", () => {
    render(<StatusBadge status="degraded" />)
    expect(screen.getByText("degraded")).toBeTruthy()
  })
})
