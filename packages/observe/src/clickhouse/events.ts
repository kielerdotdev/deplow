import type { ClickHouseClient } from "@clickhouse/client"

export type ObserveEventRow = {
  project_id: string
  issue_id: string
  grouping_id: string
  event_id: string
  digest_order: number
  timestamp: string
  received: string
  level: string
  environment: string
  release: string
  dist: string
  platform: string
  transaction_name: string
  message: string
  culprit: string
  trace_id: string
  user_id: string
  never_evict: number
  irrelevance: number
  tags: Record<string, string>
  fingerprint: string[]
  exception_json: string
  breadcrumbs_json: string
  contexts_json: string
  threads_json: string
  raw_json: string
}

export async function insertEvent(
  ch: ClickHouseClient,
  row: ObserveEventRow,
): Promise<void> {
  await ch.insert({
    table: "events",
    values: [row],
    format: "JSONEachRow",
  })
}

export async function getEvent(
  ch: ClickHouseClient,
  projectId: string,
  eventId: string,
): Promise<ObserveEventRow | null> {
  const result = await ch.query({
    query: `
      SELECT *
      FROM events
      WHERE project_id = {projectId:String}
        AND event_id = {eventId:String}
      LIMIT 1
    `,
    query_params: { projectId, eventId },
    format: "JSONEachRow",
  })
  const rows = (await result.json()) as ObserveEventRow[]
  return rows[0] ?? null
}

export async function listEventsForIssue(
  ch: ClickHouseClient,
  projectId: string,
  issueId: string,
  limit = 50,
): Promise<ObserveEventRow[]> {
  const result = await ch.query({
    query: `
      SELECT *
      FROM events
      WHERE project_id = {projectId:String}
        AND issue_id = {issueId:String}
      ORDER BY digest_order DESC
      LIMIT {limit:UInt32}
    `,
    query_params: { projectId, issueId, limit },
    format: "JSONEachRow",
  })
  return (await result.json()) as ObserveEventRow[]
}

export async function eventHistogramForIssue(
  ch: ClickHouseClient,
  projectId: string,
  issueId: string,
  from: Date,
  to: Date,
  bucketSeconds = 3600,
): Promise<Array<{ t: number; count: number }>> {
  const result = await ch.query({
    query: `
      SELECT
        toUnixTimestamp(
          toStartOfInterval(timestamp, INTERVAL {bucket:UInt32} SECOND)
        ) * 1000 AS t,
        count() AS count
      FROM events
      WHERE project_id = {projectId:String}
        AND issue_id = {issueId:String}
        AND timestamp >= parseDateTime64BestEffort({from:String}, 3)
        AND timestamp < parseDateTime64BestEffort({to:String}, 3)
      GROUP BY t
      ORDER BY t ASC
    `,
    query_params: {
      projectId,
      issueId,
      from: from.toISOString().replace("T", " ").replace("Z", ""),
      to: to.toISOString().replace("T", " ").replace("Z", ""),
      bucket: bucketSeconds,
    },
    format: "JSONEachRow",
  })
  const rows = (await result.json()) as Array<{ t: string; count: string }>
  return rows.map((r) => ({ t: Number(r.t), count: Number(r.count) }))
}

export async function countEventsForIssueInRange(
  ch: ClickHouseClient,
  projectId: string,
  issueId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const result = await ch.query({
    query: `
      SELECT count() AS c
      FROM events
      WHERE project_id = {projectId:String}
        AND issue_id = {issueId:String}
        AND timestamp >= parseDateTime64BestEffort({from:String}, 3)
        AND timestamp < parseDateTime64BestEffort({to:String}, 3)
    `,
    query_params: {
      projectId,
      issueId,
      from: from.toISOString().replace("T", " ").replace("Z", ""),
      to: to.toISOString().replace("T", " ").replace("Z", ""),
    },
    format: "JSONEachRow",
  })
  const rows = (await result.json()) as Array<{ c: string }>
  return Number(rows[0]?.c ?? 0)
}

export async function deleteOldestEvents(
  ch: ClickHouseClient,
  projectId: string,
  deleteCount: number,
): Promise<void> {
  if (deleteCount <= 0) return
  await ch.command({
    query: `
      ALTER TABLE events DELETE WHERE project_id = {projectId:String}
        AND never_evict = 0
        AND digest_order IN (
          SELECT digest_order FROM events
          WHERE project_id = {projectId:String} AND never_evict = 0
          ORDER BY digest_order ASC
          LIMIT {deleteCount:UInt32}
        )
    `,
    query_params: { projectId, deleteCount },
  })
}
