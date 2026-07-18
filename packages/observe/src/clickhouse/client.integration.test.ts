import { beforeAll, describe, expect, it } from "vitest"

import {
  ensureObserveDatabase,
  getClickHouse,
  migrateClickHouse,
  pingClickHouse,
  type ObserveClickHouseConfig,
} from "./client"
import { getEvent, insertEvent } from "./events"

function configFromEnv(): ObserveClickHouseConfig {
  return {
    url: process.env.HOSTRIG_CLICKHOUSE_URL ?? "http://127.0.0.1:8123",
    database: process.env.HOSTRIG_CLICKHOUSE_DATABASE ?? "hostrig_observe",
    username: process.env.HOSTRIG_CLICKHOUSE_USER ?? "hostrig",
    password: process.env.HOSTRIG_CLICKHOUSE_PASSWORD ?? "hostrig",
  }
}

async function clickhouseReachable(): Promise<boolean> {
  const ping = await pingClickHouse(configFromEnv())
  return ping.ok
}

describe("clickhouse client integration", () => {
  let ready = false

  beforeAll(async () => {
    ready = await clickhouseReachable()
  }, 15_000)

  it("pings, migrates, inserts and reads an event", async ({ skip }) => {
    if (!ready) {
      skip(
        "ClickHouse not reachable from this host (start profile observe; if host ports fail, run scripts/observe-ch-smoke.sh)",
      )
    }

    const config = configFromEnv()
    await ensureObserveDatabase(config)
    const migrated = await migrateClickHouse(config)
    expect(Array.isArray(migrated)).toBe(true)

    const ch = getClickHouse(config)
    const eventId = `test${Date.now().toString(16).padStart(24, "0")}`.slice(0, 32)
    const projectId = "00000000-0000-4000-8000-000000000099"
    const issueId = "00000000-0000-4000-8000-000000000098"

    await insertEvent(ch, {
      project_id: projectId,
      issue_id: issueId,
      grouping_id: "g1",
      event_id: eventId,
      digest_order: 1,
      timestamp: "2026-07-15 12:00:00.000",
      received: "2026-07-15 12:00:00.000",
      level: "error",
      environment: "test",
      release: "",
      dist: "",
      platform: "node",
      transaction_name: "",
      message: "integration-test",
      culprit: "test",
      trace_id: "",
      user_id: "",
      never_evict: 0,
      irrelevance: 0,
      tags: { suite: "observe" },
      fingerprint: ["integration"],
      exception_json: "",
      breadcrumbs_json: "",
      contexts_json: "",
      threads_json: "",
      raw_json: JSON.stringify({ message: "integration-test" }),
    })

    // Async insert may lag briefly
    await new Promise((r) => setTimeout(r, 500))
    const row = await getEvent(ch, projectId, eventId)
    expect(row?.message).toBe("integration-test")
    expect(row?.tags?.suite).toBe("observe")
  })
})
