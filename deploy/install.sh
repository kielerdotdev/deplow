#!/usr/bin/env bash
# Pull-only install / update for deplow on a VPS.
#
# Install:
#   curl -sSL https://raw.githubusercontent.com/kielerdotdev/deplow/main/deploy/install.sh | bash
# Update:
#   curl -sSL https://raw.githubusercontent.com/kielerdotdev/deplow/main/deploy/install.sh | bash -s update
#
# Env:
#   DEPLOW_HOME       install directory (default: /opt/deplow)
#   DEPLOW_VERSION    image tag (default: latest) → ghcr.io/kielerdotdev/deplow:$DEPLOW_VERSION
#   DEPLOW_IMAGE      full image ref (overrides DEPLOW_VERSION)
#   DEPLOW_ASSET_BASE raw URL prefix for compose/Caddyfile/.env.example when not beside this script
if [ -z "${BASH_VERSION:-}" ]; then
  echo "ERROR: run this script with bash (curl … | bash)" >&2
  exit 1
fi
set -euo pipefail

DEPLOW_HOME="${DEPLOW_HOME:-/opt/deplow}"
DEPLOW_VERSION="${DEPLOW_VERSION:-latest}"
DEPLOW_IMAGE="${DEPLOW_IMAGE:-ghcr.io/kielerdotdev/deplow:${DEPLOW_VERSION}}"
DEPLOW_ASSET_BASE="${DEPLOW_ASSET_BASE:-https://raw.githubusercontent.com/kielerdotdev/deplow/main/deploy}"
COMPOSE_PROJECT="deplow"
ACTION="${1:-install}"

say() { printf '\n==> %s\n' "$*"; }
ok() { printf 'OK: %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# Resolve directory containing this script when not piped through curl
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

compose() {
  docker compose -p "$COMPOSE_PROJECT" --project-directory "$DEPLOW_HOME" "$@"
}

require_docker() {
  if ! have docker; then
    die "Docker Engine is required. Install: https://docs.docker.com/engine/install/ then re-run."
  fi
  if ! docker info >/dev/null 2>&1; then
    die "Cannot talk to the Docker daemon. Is it running? Are you in the docker group (or root)?"
  fi
  if ! docker compose version >/dev/null 2>&1; then
    die "Docker Compose v2 plugin is required (docker compose)."
  fi
}

ensure_buildkit() {
  if docker ps --format '{{.Names}}' | grep -qx buildkit; then
    ok "BuildKit"
    return
  fi
  say "Starting BuildKit"
  if docker ps -a --format '{{.Names}}' | grep -qx buildkit; then
    docker start buildkit >/dev/null
  else
    docker run --rm --privileged -d --name buildkit moby/buildkit >/dev/null
  fi
  ok "BuildKit"
}

download_asset() {
  local name="$1"
  local dest="$2"
  curl -fsSL "${DEPLOW_ASSET_BASE}/${name}" -o "$dest"
}

sync_assets() {
  mkdir -p "$DEPLOW_HOME"
  local src=""
  if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/docker-compose.yml" ] && [ -f "$SCRIPT_DIR/Caddyfile" ]; then
    src="$SCRIPT_DIR"
  fi

  if [ -n "$src" ]; then
    say "Copying deploy assets from $src"
    cp "$src/docker-compose.yml" "$DEPLOW_HOME/docker-compose.yml"
    cp "$src/Caddyfile" "$DEPLOW_HOME/Caddyfile"
    if [ ! -f "$DEPLOW_HOME/.env" ] && [ -f "$src/.env.example" ]; then
      cp "$src/.env.example" "$DEPLOW_HOME/.env"
    fi
  else
    say "Downloading deploy assets from $DEPLOW_ASSET_BASE"
    download_asset "docker-compose.yml" "$DEPLOW_HOME/docker-compose.yml"
    download_asset "Caddyfile" "$DEPLOW_HOME/Caddyfile"
    if [ ! -f "$DEPLOW_HOME/.env" ]; then
      download_asset ".env.example" "$DEPLOW_HOME/.env"
    fi
  fi
}

ensure_env_secrets() {
  local envf="$DEPLOW_HOME/.env"
  if [ ! -f "$envf" ]; then
    die "Missing $envf"
  fi

  gen_secret() {
    if have openssl; then
      openssl rand -base64 32
    else
      head -c 48 /dev/urandom | base64 | tr -d '\n'
    fi
  }

  set_kv() {
    local key="$1"
    local val="$2"
    if grep -q "^${key}=" "$envf"; then
      sed -i "s|^${key}=.*|${key}=${val}|" "$envf"
    else
      printf '\n%s=%s\n' "$key" "$val" >>"$envf"
    fi
  }

  local auth_secret secrets_key
  auth_secret="$(grep -E '^BETTER_AUTH_SECRET=' "$envf" | head -1 | cut -d= -f2- || true)"
  if [ -z "$auth_secret" ] || [ "$auth_secret" = "replace-me" ] || [ "${#auth_secret}" -lt 32 ]; then
    say "Generating BETTER_AUTH_SECRET"
    set_kv BETTER_AUTH_SECRET "$(gen_secret)"
  fi
  secrets_key="$(grep -E '^DEPLOW_SECRETS_KEY=' "$envf" | head -1 | cut -d= -f2- || true)"
  if [ -z "$secrets_key" ] || [ "$secrets_key" = "replace-me-long-random" ] || [ "${#secrets_key}" -lt 32 ]; then
    say "Generating DEPLOW_SECRETS_KEY"
    set_kv DEPLOW_SECRETS_KEY "$(gen_secret)"
  fi

  # Keep image pin in env for compose / operators
  if grep -q '^DEPLOW_IMAGE=' "$envf"; then
    sed -i "s|^DEPLOW_IMAGE=.*|DEPLOW_IMAGE=${DEPLOW_IMAGE}|" "$envf"
  else
    printf '\nDEPLOW_IMAGE=%s\n' "$DEPLOW_IMAGE" >>"$envf"
  fi
}

wait_for_control_plane() {
  say "Waiting for control plane"
  local code ok_http=0
  for _ in $(seq 1 60); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${DEPLOW_WEB_PORT:-3000}/login" 2>/dev/null || true)"
    if [ "$code" = "200" ] || [ "$code" = "302" ]; then
      ok_http=1
      break
    fi
    sleep 2
  done
  if [ "$ok_http" -ne 1 ]; then
    warn "Control plane did not respond on /login yet — check: docker compose -p deplow --project-directory $DEPLOW_HOME logs web"
    return 2
  fi
  ok "Control plane responding"
}

check_s3_config() {
  local envf="$DEPLOW_HOME/.env"
  local provider access secret endpoint account
  provider="$(grep -E '^DEPLOW_S3_PROVIDER=' "$envf" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  access="$(grep -E '^DEPLOW_S3_ACCESS_KEY=' "$envf" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  secret="$(grep -E '^DEPLOW_S3_SECRET_KEY=' "$envf" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  endpoint="$(grep -E '^DEPLOW_S3_ENDPOINT=' "$envf" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  account="$(grep -E '^DEPLOW_R2_ACCOUNT_ID=' "$envf" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  if [ -z "$access" ] || [ -z "$secret" ]; then
    warn "Object storage not configured — set DEPLOW_S3_ACCESS_KEY / DEPLOW_S3_SECRET_KEY in $envf"
    warn "Provider: DEPLOW_S3_PROVIDER=minio (needs DEPLOW_S3_ENDPOINT) or r2 (needs DEPLOW_R2_ACCOUNT_ID)"
    return
  fi
  if [ "${provider:-minio}" = "r2" ] && [ -z "$account" ] && [ -z "$endpoint" ]; then
    warn "R2 selected but DEPLOW_R2_ACCOUNT_ID (or DEPLOW_S3_ENDPOINT) is empty"
  elif [ "${provider:-minio}" != "r2" ] && [ -z "$endpoint" ]; then
    warn "MinIO selected but DEPLOW_S3_ENDPOINT is empty"
  else
    ok "S3 adapter env present (${provider:-minio})"
  fi
}

check_gvisor() {
  if docker info 2>/dev/null | grep -qi runsc; then
    ok "gVisor (runsc) registered"
    return
  fi
  warn "gVisor (runsc) not detected on this Docker daemon."
  warn "User app deploys require runsc by default. Install: https://gvisor.dev/docs/user_guide/install/"
  warn "Then: sudo runsc install && sudo systemctl restart docker"
  warn "Escape hatch (unsandboxed): set DEPLOW_APP_RUNTIME=runc in $DEPLOW_HOME/.env"
}

print_done() {
  cat <<EOF

==============================
deplow ${ACTION} complete
==============================

Home:           $DEPLOW_HOME
Control plane:  http://localhost:${DEPLOW_WEB_PORT:-3000}
Caddy (apps):   http://127.0.0.1:8088  (Host: {slug}.{baseDomain})
Image:          $DEPLOW_IMAGE

Next:
  1. Configure object storage in $DEPLOW_HOME/.env (required):
       DEPLOW_S3_PROVIDER=minio|r2
       DEPLOW_S3_ACCESS_KEY=…  DEPLOW_S3_SECRET_KEY=…
       minio: DEPLOW_S3_ENDPOINT=https://minio.example.com
       r2:    DEPLOW_R2_ACCOUNT_ID=…
     then: docker compose -p deplow --project-directory $DEPLOW_HOME up -d
  2. Open http://localhost:${DEPLOW_WEB_PORT:-3000} and create the first user
  3. Domains → set base domain (apps.example.com or apps.localhost)
  4. Optional edge: set CLOUDFLARE_TUNNEL_TOKEN in $DEPLOW_HOME/.env
     then: docker compose -p deplow --project-directory $DEPLOW_HOME --profile edge up -d
  5. Ensure gVisor (runsc) on the host — see docs/secure-runtime.md

Update later:
  curl -sSL ${DEPLOW_ASSET_BASE}/install.sh | bash -s update
  # or pin: DEPLOW_VERSION=v1.2.3 curl -sSL …/install.sh | bash -s update

Logs:  docker compose -p deplow --project-directory $DEPLOW_HOME logs -f web
Stop:  docker compose -p deplow --project-directory $DEPLOW_HOME down
EOF
}

do_install() {
  require_docker
  sync_assets
  ensure_env_secrets
  ensure_buildkit
  export DEPLOW_IMAGE
  say "Pulling images"
  compose pull
  say "Starting platform + control plane"
  compose up -d
  check_s3_config
  check_gvisor
  wait_for_control_plane || true
  print_done
}

do_update() {
  require_docker
  if [ ! -f "$DEPLOW_HOME/docker-compose.yml" ]; then
    die "No install at $DEPLOW_HOME — run install first."
  fi
  # Refresh compose/Caddyfile (keeps .env)
  say "Refreshing deploy assets (preserving .env)"
  local src=""
  if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/docker-compose.yml" ]; then
    src="$SCRIPT_DIR"
    cp "$src/docker-compose.yml" "$DEPLOW_HOME/docker-compose.yml"
    cp "$src/Caddyfile" "$DEPLOW_HOME/Caddyfile"
  else
    download_asset "docker-compose.yml" "$DEPLOW_HOME/docker-compose.yml"
    download_asset "Caddyfile" "$DEPLOW_HOME/Caddyfile"
  fi
  ensure_env_secrets
  ensure_buildkit
  export DEPLOW_IMAGE
  say "Pulling $DEPLOW_IMAGE (and platform images if changed)"
  compose pull
  say "Recreating changed services"
  compose up -d
  wait_for_control_plane || true
  print_done
}

case "$ACTION" in
  install | "") do_install ;;
  update | upgrade) do_update ;;
  *) die "Unknown action: $ACTION (use install|update)" ;;
esac
