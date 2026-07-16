import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * Mirrors migrateClickHouse statement cleaning — leading `--` must not drop CREATE.
 */
function statementsFromSql(sql: string): string[] {
  const cleaned = sql
    .split("\n")
    .map((line) => (/^\s*--/.test(line) ? "" : line))
    .join("\n")
  return cleaned
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

describe("clickhouse migration SQL cleaning", () => {
  it("keeps CREATE after a leading comment line", () => {
    const sql = `-- header comment
CREATE TABLE IF NOT EXISTS events (
  id String
) ENGINE = MergeTree
ORDER BY id
TTL toDateTime(now()) + toIntervalDay(1)
`
    const stmts = statementsFromSql(sql)
    expect(stmts).toHaveLength(1)
    expect(stmts[0]).toContain("CREATE TABLE IF NOT EXISTS events")
    expect(stmts[0]).not.toMatch(/^--/)
  })

  it("events migration file is not discarded as a comment", () => {
    const file = path.resolve(import.meta.dirname, "migrations/0001_events.sql")
    const sql = fs.readFileSync(file, "utf8")
    expect(sql.trimStart().startsWith("--")).toBe(true)
    const stmts = statementsFromSql(sql)
    expect(stmts.length).toBeGreaterThanOrEqual(1)
    expect(stmts[0]).toContain("CREATE TABLE IF NOT EXISTS events")
  })
})
