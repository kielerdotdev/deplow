CREATE TABLE IF NOT EXISTS metrics_gauge (
  project_id String,
  MetricName LowCardinality(String),
  TimeUnix DateTime64(3, 'UTC'),
  Value Float64,
  ResourceAttributes Map(LowCardinality(String), String),
  Attributes Map(LowCardinality(String), String)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(TimeUnix)
ORDER BY (project_id, MetricName, TimeUnix)
TTL toDateTime(TimeUnix) + toIntervalDay(30);

CREATE TABLE IF NOT EXISTS metrics_sum (
  project_id String,
  MetricName LowCardinality(String),
  TimeUnix DateTime64(3, 'UTC'),
  Value Float64,
  ResourceAttributes Map(LowCardinality(String), String),
  Attributes Map(LowCardinality(String), String)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(TimeUnix)
ORDER BY (project_id, MetricName, TimeUnix)
TTL toDateTime(TimeUnix) + toIntervalDay(30);

CREATE TABLE IF NOT EXISTS metrics_histogram (
  project_id String,
  MetricName LowCardinality(String),
  TimeUnix DateTime64(3, 'UTC'),
  Count UInt64,
  Sum Float64,
  ResourceAttributes Map(LowCardinality(String), String),
  Attributes Map(LowCardinality(String), String)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(TimeUnix)
ORDER BY (project_id, MetricName, TimeUnix)
TTL toDateTime(TimeUnix) + toIntervalDay(30);

CREATE TABLE IF NOT EXISTS metrics_summary (
  project_id String,
  MetricName LowCardinality(String),
  TimeUnix DateTime64(3, 'UTC'),
  Count UInt64,
  Sum Float64,
  ResourceAttributes Map(LowCardinality(String), String),
  Attributes Map(LowCardinality(String), String)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(TimeUnix)
ORDER BY (project_id, MetricName, TimeUnix)
TTL toDateTime(TimeUnix) + toIntervalDay(30);

CREATE TABLE IF NOT EXISTS metrics_exp_histogram (
  project_id String,
  MetricName LowCardinality(String),
  TimeUnix DateTime64(3, 'UTC'),
  Count UInt64,
  Sum Float64,
  ResourceAttributes Map(LowCardinality(String), String),
  Attributes Map(LowCardinality(String), String)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(TimeUnix)
ORDER BY (project_id, MetricName, TimeUnix)
TTL toDateTime(TimeUnix) + toIntervalDay(30)
