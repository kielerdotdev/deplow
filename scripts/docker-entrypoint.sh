#!/usr/bin/env bash
# Control-plane container entrypoint: ensure SQLite schema, then start.
set -euo pipefail

mkdir -p /data /data/git-clones "${HOSTRIG_PROXY_ROUTES_DIR:-/etc/caddy/routes}"
export DATABASE_URL="${DATABASE_URL:-/data/hostrig.db}"
export CI=1

echo "==> Applying control-plane schema (${DATABASE_URL})"
if ! pnpm --filter @hostrig/db exec drizzle-kit push 2>/tmp/hostrig-db-push.log; then
  echo "WARN: schema push failed — see /tmp/hostrig-db-push.log" >&2
  cat /tmp/hostrig-db-push.log >&2 || true
fi

exec "$@"
