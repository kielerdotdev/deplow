-- Bridge stock otelcol-contrib clickhouse exporter tables → deplow project-scoped tables.
-- Exporter schema has no project_id; we copy from ResourceAttributes['deplow.project_id'].

CREATE TABLE IF NOT EXISTS otel_spans (
  Timestamp DateTime64(9) CODEC(Delta, ZSTD(1)),
  TraceId String CODEC(ZSTD(1)),
  SpanId String CODEC(ZSTD(1)),
  ParentSpanId String CODEC(ZSTD(1)),
  TraceState String CODEC(ZSTD(1)),
  SpanName LowCardinality(String) CODEC(ZSTD(1)),
  SpanKind LowCardinality(String) CODEC(ZSTD(1)),
  ServiceName LowCardinality(String) CODEC(ZSTD(1)),
  ResourceAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
  ScopeName String CODEC(ZSTD(1)),
  ScopeVersion String CODEC(ZSTD(1)),
  SpanAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
  Duration UInt64 CODEC(ZSTD(1)),
  StatusCode LowCardinality(String) CODEC(ZSTD(1)),
  StatusMessage String CODEC(ZSTD(1)),
  Events Nested (
    Timestamp DateTime64(9),
    Name LowCardinality(String),
    Attributes Map(LowCardinality(String), String)
  ) CODEC(ZSTD(1)),
  Links Nested (
    TraceId String,
    SpanId String,
    TraceState String,
    Attributes Map(LowCardinality(String), String)
  ) CODEC(ZSTD(1))
) ENGINE = MergeTree
PARTITION BY toDate(Timestamp)
ORDER BY (ServiceName, SpanName, toDateTime(Timestamp))
TTL toDateTime(Timestamp) + toIntervalHour(168)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;

CREATE TABLE IF NOT EXISTS otel_logs (
  Timestamp DateTime64(9) CODEC(Delta(8), ZSTD(1)),
  TimestampTime DateTime DEFAULT toDateTime(Timestamp),
  TraceId String CODEC(ZSTD(1)),
  SpanId String CODEC(ZSTD(1)),
  TraceFlags UInt8,
  SeverityText LowCardinality(String) CODEC(ZSTD(1)),
  SeverityNumber UInt8,
  ServiceName LowCardinality(String) CODEC(ZSTD(1)),
  Body String CODEC(ZSTD(1)),
  ResourceSchemaUrl LowCardinality(String) CODEC(ZSTD(1)),
  ResourceAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
  ScopeSchemaUrl LowCardinality(String) CODEC(ZSTD(1)),
  ScopeName String CODEC(ZSTD(1)),
  ScopeVersion LowCardinality(String) CODEC(ZSTD(1)),
  ScopeAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
  LogAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1))
) ENGINE = MergeTree
PARTITION BY toDate(TimestampTime)
PRIMARY KEY (ServiceName, TimestampTime)
ORDER BY (ServiceName, TimestampTime, Timestamp)
TTL TimestampTime + toIntervalHour(168)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS spans_from_otel_mv
TO spans
AS SELECT
  ResourceAttributes['deplow.project_id'] AS project_id,
  Timestamp,
  TraceId,
  SpanId,
  ParentSpanId,
  TraceState,
  SpanName,
  SpanKind,
  ServiceName,
  ResourceAttributes,
  SpanAttributes,
  toInt64(Duration) AS Duration,
  StatusCode,
  StatusMessage
FROM otel_spans
WHERE ResourceAttributes['deplow.project_id'] != '';

CREATE MATERIALIZED VIEW IF NOT EXISTS logs_from_otel_mv
TO logs
AS SELECT
  ResourceAttributes['deplow.project_id'] AS project_id,
  Timestamp,
  SeverityText,
  Body,
  ServiceName,
  TraceId,
  SpanId,
  ResourceAttributes,
  LogAttributes
FROM otel_logs
WHERE ResourceAttributes['deplow.project_id'] != '';
