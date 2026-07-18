-- Rebrand: prefer hostrig.project_id, still accept legacy deplow.project_id.
-- Recreate MVs so instances that already applied 0006 with only deplow.* pick up both keys.

DROP VIEW IF EXISTS spans_from_otel_mv;
DROP VIEW IF EXISTS logs_from_otel_mv;

CREATE MATERIALIZED VIEW IF NOT EXISTS spans_from_otel_mv
TO spans
AS SELECT
  if(
    ResourceAttributes['hostrig.project_id'] != '',
    ResourceAttributes['hostrig.project_id'],
    ResourceAttributes['deplow.project_id']
  ) AS project_id,
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
WHERE ResourceAttributes['hostrig.project_id'] != ''
   OR ResourceAttributes['deplow.project_id'] != '';

CREATE MATERIALIZED VIEW IF NOT EXISTS logs_from_otel_mv
TO logs
AS SELECT
  if(
    ResourceAttributes['hostrig.project_id'] != '',
    ResourceAttributes['hostrig.project_id'],
    ResourceAttributes['deplow.project_id']
  ) AS project_id,
  Timestamp,
  SeverityText,
  Body,
  ServiceName,
  TraceId,
  SpanId,
  ResourceAttributes,
  LogAttributes
FROM otel_logs
WHERE ResourceAttributes['hostrig.project_id'] != ''
   OR ResourceAttributes['deplow.project_id'] != '';
