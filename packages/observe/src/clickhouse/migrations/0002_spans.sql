-- Unified spans (OTLP + Sentry transaction normalize).
CREATE TABLE IF NOT EXISTS spans (
  project_id String,
  Timestamp DateTime64(9, 'UTC'),
  TraceId String,
  SpanId String,
  ParentSpanId String,
  TraceState String,
  SpanName String,
  SpanKind LowCardinality(String),
  ServiceName LowCardinality(String),
  ResourceAttributes Map(LowCardinality(String), String),
  SpanAttributes Map(LowCardinality(String), String),
  Duration Int64,
  StatusCode LowCardinality(String),
  StatusMessage String
) ENGINE = MergeTree
PARTITION BY toDate(Timestamp)
ORDER BY (project_id, ServiceName, toUnixTimestamp(Timestamp), TraceId)
TTL toDateTime(Timestamp) + toIntervalDay(7)
