import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  loadRecentCommands,
  pushRecentCommand,
} from "@/lib/command/recents"

describe("command recents", () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value)
        },
        clear: () => store.clear(),
      },
    })
  })

  it("pushes and dedupes recent goto ids", () => {
    expect(loadRecentCommands()).toEqual([])

    pushRecentCommand("nav.home", "Home")
    pushRecentCommand("nav.nodes", "Nodes")
    pushRecentCommand("nav.home", "Home")

    const recents = loadRecentCommands()
    expect(recents.map((r) => r.id)).toEqual(["nav.home", "nav.nodes"])
    expect(recents[0]?.label).toBe("Home")
  })

  it("caps at eight entries", () => {
    for (let i = 0; i < 12; i++) {
      pushRecentCommand(`id.${i}`, `Label ${i}`)
    }
    expect(loadRecentCommands()).toHaveLength(8)
    expect(loadRecentCommands()[0]?.id).toBe("id.11")
  })
})
