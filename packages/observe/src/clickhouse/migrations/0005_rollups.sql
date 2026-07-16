-- Hourly service RED rollups for faster inventory queries.
CREATE TABLE IF NOT EXISTS spans_service_1h (
  project_id String,
  bucket DateTime('UTC'),
  ServiceName LowCardinality(String),
  span_count UInt64,
  error_count UInt64,
  duration_sum Float64,
  duration_p50 Float64,
  duration_p95 Float64,
  duration_p99 Float64
) ENGINE = SummingMergeTree
PARTITION BY toDate(bucket)
ORDER BY (project_id, ServiceName, bucket)
TTL bucket + toIntervalDay(30);

CREATE MATERIALIZED VIEW IF NOT EXISTS spans_service_1h_mv
TO spans_service_1h
AS SELECT
  project_id,
  toStartOfHour(Timestamp) AS bucket,
  ServiceName,
  count() AS span_count,
  countIf(StatusCode = 'STATUS_CODE_ERROR') AS error_count,
  sum(Duration) AS duration_sum,
  quantile(0.5)(Duration) AS duration_p50,
  quantile(0.95)(Duration) AS duration_p95,
  quantile(0.99)(Duration) AS duration_p99
FROM spans
GROUP BY project_id, bucket, ServiceName;

CREATE TABLE IF NOT EXISTS spans_operation_1h (
  project_id String,
  bucket DateTime('UTC'),
  ServiceName LowCardinality(String),
  SpanName String,
  span_count UInt64,
  error_count UInt64,
  duration_p95 Float64
) ENGINE = SummingMergeTree
PARTITION BY toDate(bucket)
ORDER BY (project_id, ServiceName, SpanName, bucket)
TTL bucket + toIntervalDay(30);

CREATE MATERIALIZED VIEW IF NOT EXISTS spans_operation_1h_mv
TO spans_operation_1h
AS SELECT
  project_id,
  toStartOfHour(Timestamp) AS bucket,
  ServiceName,
  SpanName,
  count() AS span_count,
  countIf(StatusCode = 'STATUS_CODE_ERROR') AS error_count,
  quantile(0.95)(Duration) AS duration_p95
FROM spans
GROUP BY project_id, bucket, ServiceName, SpanName;
