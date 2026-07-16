-- Observe telemetry: error events (Sentry envelope digest). Sole event payload store.
CREATE TABLE IF NOT EXISTS events (
  project_id String,
  issue_id String,
  grouping_id String,
  event_id String,
  digest_order UInt64,
  timestamp DateTime64(3, 'UTC'),
  received DateTime64(3, 'UTC'),
  level LowCardinality(String),
  environment LowCardinality(String),
  release String,
  dist String,
  platform LowCardinality(String),
  transaction_name String,
  message String,
  culprit String,
  trace_id String,
  user_id String,
  never_evict UInt8,
  irrelevance UInt8,
  tags Map(String, String),
  fingerprint Array(String),
  exception_json String,
  breadcrumbs_json String,
  contexts_json String,
  threads_json String,
  raw_json String
) ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, issue_id, digest_order)
TTL toDateTime(timestamp) + toIntervalDay(30)
