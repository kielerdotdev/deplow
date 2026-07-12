/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useLogStream } from "./use-log-stream"

describe("useLogStream", () => {
  it("fetches when enabled and keeps polling", async () => {
    let n = 0
    const fetch = vi.fn(async () => {
      n += 1
      return { body: `line-${n}`, live: true }
    })

    const { result } = renderHook(() =>
      useLogStream({
        enabled: true,
        intervalMs: 40,
        fetch,
      }),
    )

    await waitFor(() => expect(result.current.body).toMatch(/^line-\d+$/))
    expect(result.current.live).toBe(true)
    await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(result.current.body).toMatch(/^line-\d+$/)
  })

  it("stops polling when disabled", async () => {
    const fetch = vi.fn(async () => ({ body: "once", live: false }))
    const { rerender } = renderHook(
      ({ enabled }) => useLogStream({ enabled, intervalMs: 40, fetch }),
      { initialProps: { enabled: true } },
    )

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const calls = fetch.mock.calls.length
    rerender({ enabled: false })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120))
    })
    expect(fetch.mock.calls.length).toBe(calls)
  })
})
