import { describe, expect, it } from "vitest"

import { loadConfig, saveConfig } from "./config"

describe("cli config", () => {
  it("prefers env over file when both present", () => {
    const prevUrl = process.env.HOSTRIG_URL
    const prevToken = process.env.HOSTRIG_TOKEN
    process.env.HOSTRIG_URL = "https://example.test/"
    process.env.HOSTRIG_TOKEN = "tok_test"
    try {
      const cfg = loadConfig()
      expect(cfg).toEqual({
        url: "https://example.test",
        token: "tok_test",
      })
    } finally {
      if (prevUrl === undefined) delete process.env.HOSTRIG_URL
      else process.env.HOSTRIG_URL = prevUrl
      if (prevToken === undefined) delete process.env.HOSTRIG_TOKEN
      else process.env.HOSTRIG_TOKEN = prevToken
    }
  })

  it("round-trips save/load when env unset", () => {
    const prevUrl = process.env.HOSTRIG_URL
    const prevToken = process.env.HOSTRIG_TOKEN
    const prevXdg = process.env.XDG_CONFIG_HOME
    delete process.env.HOSTRIG_URL
    delete process.env.HOSTRIG_TOKEN
    process.env.XDG_CONFIG_HOME = `/tmp/hostrig-cli-test-${process.pid}`
    try {
      saveConfig({ url: "https://cp.example", token: "secret" })
      const cfg = loadConfig()
      expect(cfg).toEqual({ url: "https://cp.example", token: "secret" })
    } finally {
      if (prevUrl === undefined) delete process.env.HOSTRIG_URL
      else process.env.HOSTRIG_URL = prevUrl
      if (prevToken === undefined) delete process.env.HOSTRIG_TOKEN
      else process.env.HOSTRIG_TOKEN = prevToken
      if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME
      else process.env.XDG_CONFIG_HOME = prevXdg
    }
  })
})
