import { describe, expect, it } from "vitest"

import {
  entriesToRecord,
  mergeProjectEnvSave,
  parseEnvText,
  PROJECT_ENV_SECRET_MASK,
  recordToEntries,
} from "./project-secrets.service"

describe("parseEnvText", () => {
  it("parses KEY=value lines and skips comments", () => {
    const entries = parseEnvText(`
# comment
API_KEY=abc123
DEBUG=true

# trailing
OTHER="quoted value"
`)
    expect(entries).toEqual([
      { key: "API_KEY", value: "abc123" },
      { key: "DEBUG", value: "true" },
      { key: "OTHER", value: "quoted value" },
    ])
  })
})

describe("mergeProjectEnvSave", () => {
  it("preserves existing values when masked placeholder is sent", () => {
    const merged = mergeProjectEnvSave(
      { API_KEY: "secret", NEW: "x" },
      [
        { key: "API_KEY", value: PROJECT_ENV_SECRET_MASK },
        { key: "NEW", value: "updated" },
      ],
    )
    expect(merged).toEqual({ API_KEY: "secret", NEW: "updated" })
  })
})

describe("entriesToRecord", () => {
  it("rejects reserved platform keys", () => {
    expect(() =>
      entriesToRecord([{ key: "DATABASE_URL", value: "x" }]),
    ).toThrow(/Reserved keys/)
  })

  it("rejects duplicate keys", () => {
    expect(() =>
      entriesToRecord([
        { key: "FOO", value: "a" },
        { key: "FOO", value: "b" },
      ]),
    ).toThrow(/Duplicate keys/)
  })
})

describe("recordToEntries", () => {
  it("sorts keys alphabetically", () => {
    expect(recordToEntries({ Z: "1", A: "2" })).toEqual([
      { key: "A", value: "2" },
      { key: "Z", value: "1" },
    ])
  })
})
