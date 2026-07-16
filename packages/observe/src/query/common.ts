import type { ClickHouseClient } from "@clickhouse/client"
import type { ObserveClickHouseConfig } from "../clickhouse/client"
import { getClickHouse } from "../clickhouse/client"

export type TimeBounds = { from: Date; to: Date }

export function ch(config: ObserveClickHouseConfig): ClickHouseClient {
  return getClickHouse(config)
}

export function iso(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "")
}

/** Escape a string literal for ClickHouse single-quoted strings. */
export function esc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

export type SpanFilter = {
  projectId: string
  from: Date
  to: Date
  service?: string
  operation?: string
  release?: string
  environment?: string
  statusError?: boolean
  /** Free text against SpanName */
  q?: string
  /** Attribute filters: key op value against SpanAttributes / ResourceAttributes */
  attributeFilters?: Array<{
    key: string
    op:
      | "eq"
      | "neq"
      | "contains"
      | "not_contains"
      | "exists"
      | "not_exists"
      | "gt"
      | "gte"
      | "lt"
      | "lte"
    value?: string
  }>
  /** Duration ms bounds (Duration is nanoseconds in CH) */
  durationMsMin?: number
  durationMsMax?: number
}

export function spanWhere(f: SpanFilter): string {
  const parts = [
    `project_id = '${esc(f.projectId)}'`,
    `Timestamp >= parseDateTime64BestEffort('${iso(f.from)}', 9)`,
    `Timestamp < parseDateTime64BestEffort('${iso(f.to)}', 9)`,
  ]
  if (f.service) parts.push(`ServiceName = '${esc(f.service)}'`)
  if (f.operation) parts.push(`SpanName = '${esc(f.operation)}'`)
  if (f.release) {
    parts.push(
      `(ResourceAttributes['service.version'] = '${esc(f.release)}' OR SpanAttributes['service.version'] = '${esc(f.release)}')`,
    )
  }
  if (f.environment) {
    parts.push(
      `(ResourceAttributes['deployment.environment'] = '${esc(f.environment)}' OR SpanAttributes['deployment.environment'] = '${esc(f.environment)}')`,
    )
  }
  if (f.statusError) parts.push(`StatusCode = 'STATUS_CODE_ERROR'`)
  if (f.q) parts.push(`positionCaseInsensitive(SpanName, '${esc(f.q)}') > 0`)
  if (f.durationMsMin !== undefined) {
    parts.push(`Duration >= ${Math.floor(f.durationMsMin * 1e6)}`)
  }
  if (f.durationMsMax !== undefined) {
    parts.push(`Duration <= ${Math.floor(f.durationMsMax * 1e6)}`)
  }
  for (const af of f.attributeFilters ?? []) {
    const attr = `coalesce(SpanAttributes['${esc(af.key)}'], ResourceAttributes['${esc(af.key)}'])`
    switch (af.op) {
      case "eq":
        parts.push(`${attr} = '${esc(af.value ?? "")}'`)
        break
      case "neq":
        parts.push(`${attr} != '${esc(af.value ?? "")}'`)
        break
      case "contains":
        parts.push(`positionCaseInsensitive(${attr}, '${esc(af.value ?? "")}') > 0`)
        break
      case "not_contains":
        parts.push(`positionCaseInsensitive(${attr}, '${esc(af.value ?? "")}') = 0`)
        break
      case "exists":
        parts.push(`${attr} != ''`)
        break
      case "not_exists":
        parts.push(`${attr} = ''`)
        break
      case "gt":
        parts.push(`toFloat64OrZero(${attr}) > ${Number(af.value) || 0}`)
        break
      case "gte":
        parts.push(`toFloat64OrZero(${attr}) >= ${Number(af.value) || 0}`)
        break
      case "lt":
        parts.push(`toFloat64OrZero(${attr}) < ${Number(af.value) || 0}`)
        break
      case "lte":
        parts.push(`toFloat64OrZero(${attr}) <= ${Number(af.value) || 0}`)
        break
    }
  }
  return parts.join(" AND ")
}

export async function queryJson<T>(
  config: ObserveClickHouseConfig,
  query: string,
): Promise<T[]> {
  const client = ch(config)
  const result = await client.query({ query, format: "JSONEachRow" })
  return (await result.json()) as T[]
}
