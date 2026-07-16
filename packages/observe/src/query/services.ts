import type { ObserveClickHouseConfig } from "../clickhouse/client"
import { queryJson, spanWhere, type SpanFilter, type TimeBounds } from "./common"

export type ServiceRedRow = {
  service: string
  request_rate: number
  error_rate: number
  error_count: number
  span_count: number
  duration_p50_ms: number
  duration_p95_ms: number
  duration_p99_ms: number
}

export type OperationRedRow = ServiceRedRow & { operation: string }

export async function listServicesRed(
  config: ObserveClickHouseConfig,
  filter: Omit<SpanFilter, "service" | "operation">,
): Promise<ServiceRedRow[]> {
  const where = spanWhere(filter)
  const rows = await queryJson<{
    service: string
    span_count: string
    error_count: string
    p50: string
    p95: string
    p99: string
  }>(
    config,
    `
    SELECT
      ServiceName AS service,
      count() AS span_count,
      countIf(StatusCode = 'STATUS_CODE_ERROR') AS error_count,
      quantile(0.5)(Duration) AS p50,
      quantile(0.95)(Duration) AS p95,
      quantile(0.99)(Duration) AS p99
    FROM spans
    WHERE ${where}
    GROUP BY ServiceName
    ORDER BY span_count DESC
    LIMIT 200
    `,
  )
  const windowSec = Math.max(
    (filter.to.getTime() - filter.from.getTime()) / 1000,
    1,
  )
  return rows.map((r) => {
    const spanCount = Number(r.span_count)
    const errorCount = Number(r.error_count)
    return {
      service: r.service,
      span_count: spanCount,
      error_count: errorCount,
      request_rate: spanCount / windowSec,
      error_rate: spanCount > 0 ? errorCount / spanCount : 0,
      duration_p50_ms: Number(r.p50) / 1e6,
      duration_p95_ms: Number(r.p95) / 1e6,
      duration_p99_ms: Number(r.p99) / 1e6,
    }
  })
}

export async function listOperationsRed(
  config: ObserveClickHouseConfig,
  filter: SpanFilter & { service: string },
): Promise<OperationRedRow[]> {
  const where = spanWhere(filter)
  const rows = await queryJson<{
    operation: string
    span_count: string
    error_count: string
    p50: string
    p95: string
    p99: string
  }>(
    config,
    `
    SELECT
      SpanName AS operation,
      count() AS span_count,
      countIf(StatusCode = 'STATUS_CODE_ERROR') AS error_count,
      quantile(0.5)(Duration) AS p50,
      quantile(0.95)(Duration) AS p95,
      quantile(0.99)(Duration) AS p99
    FROM spans
    WHERE ${where}
    GROUP BY SpanName
    ORDER BY span_count DESC
    LIMIT 200
    `,
  )
  const windowSec = Math.max(
    (filter.to.getTime() - filter.from.getTime()) / 1000,
    1,
  )
  return rows.map((r) => {
    const spanCount = Number(r.span_count)
    const errorCount = Number(r.error_count)
    return {
      service: filter.service,
      operation: r.operation,
      span_count: spanCount,
      error_count: errorCount,
      request_rate: spanCount / windowSec,
      error_rate: spanCount > 0 ? errorCount / spanCount : 0,
      duration_p50_ms: Number(r.p50) / 1e6,
      duration_p95_ms: Number(r.p95) / 1e6,
      duration_p99_ms: Number(r.p99) / 1e6,
    }
  })
}

export async function overviewRed(
  config: ObserveClickHouseConfig,
  filter: Omit<SpanFilter, "service" | "operation">,
): Promise<{
  span_count: number
  error_count: number
  request_rate: number
  error_rate: number
  duration_p95_ms: number
  services: number
}> {
  const where = spanWhere(filter)
  const rows = await queryJson<{
    span_count: string
    error_count: string
    p95: string
    services: string
  }>(
    config,
    `
    SELECT
      count() AS span_count,
      countIf(StatusCode = 'STATUS_CODE_ERROR') AS error_count,
      quantile(0.95)(Duration) AS p95,
      uniqExact(ServiceName) AS services
    FROM spans
    WHERE ${where}
    `,
  )
  const r = rows[0]
  const spanCount = Number(r?.span_count ?? 0)
  const errorCount = Number(r?.error_count ?? 0)
  const windowSec = Math.max(
    (filter.to.getTime() - filter.from.getTime()) / 1000,
    1,
  )
  return {
    span_count: spanCount,
    error_count: errorCount,
    request_rate: spanCount / windowSec,
    error_rate: spanCount > 0 ? errorCount / spanCount : 0,
    duration_p95_ms: Number(r?.p95 ?? 0) / 1e6,
    services: Number(r?.services ?? 0),
  }
}

export type { TimeBounds }
