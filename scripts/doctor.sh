#!/usr/bin/env bash
# Host preflight for deplow operators.
# Mirrors evaluateDoctorChecks status rules in apps/web/src/lib/core/doctor.ts
# Exit 0 when no fail checks; 1 when any fail.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ok() { printf '[OK  ] %s: %s\n' "$1" "$2"; }
warn() { printf '[WARN] %s: %s\n' "$1" "$2"; WARNS=$((WARNS + 1)); }
fail() { printf '[FAIL] %s: %s\n' "$1" "$2"; FAILS=$((FAILS + 1)); }

FAILS=0
WARNS=0

echo "deplow doctor"
echo "-------------"

if docker info >/dev/null 2>&1; then
  ok "Docker Engine" "$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo reachable)"
else
  fail "Docker Engine" "docker info failed — start Docker and ensure socket access"
fi

if docker info 2>/dev/null | grep -qi runsc || command -v runsc >/dev/null 2>&1; then
  ok "gVisor (runsc)" "runsc detected (verify: docker run --rm --runtime=runsc hello-world)"
else
  fail "gVisor (runsc)" "runsc missing — install gVisor or set DEPLOW_APP_RUNTIME=runc"
fi

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^buildkit$' || [ -n "${BUILDKIT_HOST:-}" ]; then
  ok "BuildKit" "${BUILDKIT_HOST:-buildkit container running}"
else
  warn "BuildKit" "not detected — Railpack/Dockerfile builds may fail"
fi

if command -v "${RAILPACK_BIN:-railpack}" >/dev/null 2>&1; then
  ok "Railpack CLI" "$("${RAILPACK_BIN:-railpack}" --version 2>/dev/null | head -1 || echo on PATH)"
else
  warn "Railpack CLI" "not on PATH — Dockerfile-only source still works"
fi

pg=0 redis=0 minio=0 caddy=0
docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^deplow-postgres$' && pg=1 || true
docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^deplow-redis$' && redis=1 || true
docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^deplow-minio$' && minio=1 || true
docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^deplow-caddy$' && caddy=1 || true
if [ "$pg" = 1 ] && [ "$redis" = 1 ] && [ "$minio" = 1 ] && [ "$caddy" = 1 ]; then
  ok "Platform compose" "Postgres, Redis, MinIO, Caddy running"
else
  fail "Platform compose" "postgres=$pg redis=$redis minio=$minio caddy=$caddy — run pnpm infra:up"
fi

if [ -n "${DEPLOW_BASE_DOMAIN:-}" ]; then
  ok "Base domain" "DEPLOW_BASE_DOMAIN=$DEPLOW_BASE_DOMAIN"
else
  warn "Base domain" "DEPLOW_BASE_DOMAIN empty — public URL features off"
fi

if [ -n "${BETTER_AUTH_SECRET:-}" ] || [ -n "${DEPLOW_SECRETS_KEY:-}" ]; then
  ok "Auth / secrets keys" "configured"
else
  if [ "${NODE_ENV:-}" = "production" ]; then
    fail "Auth / secrets keys" "set BETTER_AUTH_SECRET and DEPLOW_SECRETS_KEY"
  else
    warn "Auth / secrets keys" "unset (dev fallback may be used)"
  fi
fi

echo "-------------"
if [ "$FAILS" -eq 0 ]; then
  echo "Ready enough to proceed ($WARNS warning(s))."
  echo "Tip: unit-tested evaluator lives in apps/web/src/lib/core/doctor.ts"
  exit 0
fi
echo "$FAILS check(s) failed. Fix FAIL items before deploy."
exit 1
