/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { FilterBuilder, FilterChips } from "./filter-builder"
import type { FilterClause } from "@/lib/observe/context"

afterEach(() => {
  cleanup()
})

describe("FilterBuilder", () => {
  it("disables Add filter until the row is complete", () => {
    const onChange = vi.fn()
    render(<FilterBuilder filters={[]} onChange={onChange} />)
    const add = screen.getByRole("button", { name: /add filter/i })
    expect(add).toHaveProperty("disabled", true)
    fireEvent.change(screen.getByLabelText("Filter key"), {
      target: { value: "service" },
    })
    // still needs value for eq
    expect(add).toHaveProperty("disabled", true)
    fireEvent.change(screen.getByLabelText("Filter value"), {
      target: { value: "api" },
    })
    expect(add).toHaveProperty("disabled", false)
    fireEvent.click(add)
    expect(onChange).toHaveBeenCalledWith([
      { key: "service", op: "eq", value: "api" },
    ])
  })

  it("removes a filter chip", () => {
    const onChange = vi.fn()
    const filters: FilterClause[] = [
      { key: "service", op: "eq", value: "api" },
      { key: "env", op: "eq", value: "prod" },
    ]
    render(<FilterChips filters={filters} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /remove filter service/i }))
    expect(onChange).toHaveBeenCalledWith([
      { key: "env", op: "eq", value: "prod" },
    ])
  })
})
