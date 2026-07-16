#!/usr/bin/env bash
# Smoke ClickHouse migrations + insert/read when host port publish is flaky.
# Prefers host URL; falls back to docker-network Node runner.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

docker compose --profile observe up -d clickhouse
echo "waiting for clickhouse..."
for i in $(seq 1 40); do
  if docker exec deplow-clickhouse wget -qO- 'http://127.0.0.1:8123/ping' 2>/dev/null | grep -q Ok; then
    break
  fi
  sleep 1
done

docker exec deplow-clickhouse wget -qO- 'http://127.0.0.1:8123/ping'
echo

CH_URL="${DEPLOW_CLICKHOUSE_URL:-}"
if [ -z "$CH_URL" ]; then
  if curl -fsS -m 2 'http://deplow:deplow@127.0.0.1:8123/ping' >/dev/null 2>&1; then
    CH_URL="http://127.0.0.1:8123"
  else
    CH_URL=""
  fi
fi

run_node_smoke() {
  local url="$1"
  DEPLOW_CLICKHOUSE_URL="$url" \
  DEPLOW_CLICKHOUSE_DATABASE="${DEPLOW_CLICKHOUSE_DATABASE:-deplow_observe}" \
  DEPLOW_CLICKHOUSE_USER="${DEPLOW_CLICKHOUSE_USER:-deplow}" \
  DEPLOW_CLICKHOUSE_PASSWORD="${DEPLOW_CLICKHOUSE_PASSWORD:-deplow}" \
  pnpm exec vp test packages/observe/src/clickhouse/client.integration.test.ts
}

if [ -n "$CH_URL" ]; then
  echo "using host ClickHouse at $CH_URL"
  run_node_smoke "$CH_URL"
else
  echo "host :8123 unreachable — running integration test on compose network"
  docker run --rm \
    --network deplow_default \
    -v "$ROOT:/work" \
    -w /work \
    -e DEPLOW_CLICKHOUSE_URL=http://clickhouse:8123 \
    -e DEPLOW_CLICKHOUSE_DATABASE=deplow_observe \
    -e DEPLOW_CLICKHOUSE_USER=deplow \
    -e DEPLOW_CLICKHOUSE_PASSWORD=deplow \
    -e CI=1 \
    node:22-bookworm bash -lc '
      set -euo pipefail
      corepack enable
      corepack prepare pnpm@10.12.1 --activate
      # Reuse host install when present
      if [ ! -d node_modules ]; then
        pnpm install --frozen-lockfile
      fi
      pnpm exec vp test packages/observe/src/clickhouse/client.integration.test.ts
    '
fi

# Native SQL proof via clickhouse-client inside the container
docker exec deplow-clickhouse clickhouse-client --user deplow --password deplow -q \
  "CREATE DATABASE IF NOT EXISTS deplow_observe; SELECT 'sql-ok'"

echo "observe-ch-smoke: PASS"
