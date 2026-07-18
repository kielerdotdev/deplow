#!/usr/bin/env bash
# Every container start — bring up infra, DB schema, and the web app.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

LOG_DIR="${HOME}/.cache/hostrig"
mkdir -p "$LOG_DIR"

wait_for_docker() {
  local i
  for i in $(seq 1 30); do
    if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

if ! wait_for_docker; then
  echo "ERROR: Docker socket not available after 30s."
  echo "Host must run Docker Engine; Dev Container uses docker-outside-of-docker."
  echo "This host sets no-new-privileges — start via .devcontainer/up.sh so"
  echo "DOCKER_GID=$(stat -c '%g' /var/run/docker.sock 2>/dev/null || echo '?') is passed as --group-add."
  exit 1
fi

# Host path bind mount shares node_modules; repair ABI drift from host pnpm.
ensure_native_addons() {
  local mod
  mod="$(node -p 'process.versions.modules')"
  if pnpm --filter @hostrig/db exec node -e "require('better-sqlite3')" >/dev/null 2>&1; then
    return 0
  fi
  echo "==> rebuild better-sqlite3 for NODE_MODULE_VERSION $mod"
  pnpm rebuild better-sqlite3 || pnpm install --force
}

echo "==> docker compose infra"
pnpm infra:up

echo "==> native addons"
ensure_native_addons

echo "==> db:push"
# Never auto-accept data-loss prompts; warn and continue if schema needs a TTY.
if ! pnpm db:push; then
  echo "WARN: db:push failed (schema drift or non-interactive). Fix with an interactive shell if needed."
fi

export HOSTRIG_HETZNER_K3S_BIN="${HOSTRIG_HETZNER_K3S_BIN:-/usr/local/bin/hetzner-k3s}"

# Make sure railpack exists before web starts (no rebuild required if image is old).
if ! command -v railpack >/dev/null 2>&1 && [ ! -x /usr/local/bin/railpack ]; then
  bash scripts/ensure-railpack.sh || true
fi
if [ -x /usr/local/bin/railpack ]; then
  export RAILPACK_BIN=/usr/local/bin/railpack
elif [ -x "$PWD/.tools/bin/railpack" ]; then
  export RAILPACK_BIN="$PWD/.tools/bin/railpack"
  export PATH="$PWD/.tools/bin:$PATH"
fi

web_healthy() {
  # Require a successful HTTP response (not just a listener — 500 is not ready).
  curl -sf -o /dev/null --connect-timeout 1 http://127.0.0.1:9565/ 2>/dev/null
}

stop_stale_web() {
  if [ -f "$LOG_DIR/web.pid" ]; then
    local pid
    pid="$(cat "$LOG_DIR/web.pid" 2>/dev/null || true)"
    if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
      echo "==> stopping previous web pid $pid"
      kill "$pid" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$LOG_DIR/web.pid"
  fi
}

start_web() {
  if web_healthy; then
    echo "OK: web already healthy on :9565"
    return
  fi

  # Something may be bound but unhealthy (e.g. ABI mismatch 500s) — replace our prior process.
  stop_stale_web

  if web_healthy; then
    echo "OK: web became healthy after clearing stale pid"
    return
  fi

  # If another process holds :9565 and is unhealthy, we cannot bind — surface that clearly.
  if ss -ltn 2>/dev/null | grep -q ':9565 ' || netstat -ltn 2>/dev/null | grep -q ':9565 '; then
    echo "WARN: :9565 is in use but not healthy. Stop the host process, then re-run post-start:"
    echo "      bash .devcontainer/post-start.sh"
    return
  fi

  echo "==> starting pnpm dev (background)"
  nohup pnpm dev >"$LOG_DIR/web.log" 2>&1 &
  echo $! >"$LOG_DIR/web.pid"

  local i
  for i in $(seq 1 90); do
    if web_healthy; then
      echo "OK: Hostrig web on http://localhost:9565"
      return
    fi
    # Fail fast if the process died
    if [ -f "$LOG_DIR/web.pid" ] && ! kill -0 "$(cat "$LOG_DIR/web.pid")" 2>/dev/null; then
      echo "ERROR: web process exited — check $LOG_DIR/web.log"
      tail -40 "$LOG_DIR/web.log" || true
      return 1
    fi
    sleep 1
  done
  echo "WARN: web did not become ready in 90s — check $LOG_DIR/web.log"
  tail -40 "$LOG_DIR/web.log" || true
}

start_web

cat <<EOF

Hostrig Dev Container is up.
  UI:     http://localhost:9565
  Public: https://hostrig.waitforit.cc
  Logs:   $LOG_DIR/web.log
  CLI:    hetzner-k3s ($(command -v hetzner-k3s))
  Railpack: $(railpack --version 2>/dev/null || echo missing — rebuild container)
  Docker: $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo unknown)
  Node:   $(node -v)

Local development is Dev Container only. Put secrets in apps/web/.env
then restart web: kill \$(cat $LOG_DIR/web.pid) 2>/dev/null; pnpm dev

EOF
