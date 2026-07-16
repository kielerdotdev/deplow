CREATE TABLE IF NOT EXISTS logs (
  project_id String,
  Timestamp DateTime64(9, 'UTC'),
  SeverityText LowCardinality(String),
  Body String,
  ServiceName LowCardinality(String),
  TraceId String,
  SpanId String,
  ResourceAttributes Map(LowCardinality(String), String),
  LogAttributes Map(LowCardinality(String), String)
) ENGINE = MergeTree
PARTITION BY toDate(Timestamp)
ORDER BY (project_id, ServiceName, toUnixTimestamp(Timestamp), TraceId)
TTL toDateTime(Timestamp) + toIntervalDay(14)
