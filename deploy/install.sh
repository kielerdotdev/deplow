#!/usr/bin/env bash
# One-shot VPS install / update for hostrig.
#
#   curl -sSL https://github.com/kielerdotdev/hostrig/releases/download/install/install.sh | sudo bash
#
# That is the whole install. Docker, gVisor, MinIO, secrets, public URL, pull, start.
#
# Update later:
#   curl -sSL https://github.com/kielerdotdev/hostrig/releases/download/install/install.sh | sudo bash -s update
#
# Optional env:
#   HOSTRIG_HOME              install dir (default /opt/hostrig)
#   HOSTRIG_VERSION           image tag (default latest)
#   HOSTRIG_IMAGE             full image ref (overrides version)
#   HOSTRIG_PUBLIC_URL        e.g. http://1.2.3.4:3000 (auto-detected if unset)
#   HOSTRIG_WEB_PORT          host port (default 3000)
#   HOSTRIG_BUNDLE_MINIO      1 (default) bundle MinIO · 0 use external S3 only
#   HOSTRIG_APP_RUNTIME       always runsc/gVisor for user apps (runc not allowed)
#   GHCR_TOKEN / GITHUB_TOKEN  pull private ghcr.io/kielerdotdev/hostrig
#   CLOUDFLARE_TUNNEL_TOKEN  also starts cloudflared (edge profile)
#   HOSTRIG_ASSET_BASE        override raw asset URL (private-repo fallback)
if [ -z "${BASH_VERSION:-}" ]; then
  echo "ERROR: run with bash (curl … | bash)" >&2
  exit 1
fi
set -euo pipefail

# Legacy DEPLOW_* env aliases (pre-hostrig brand). HOSTRIG_* wins when both set.
while IFS= read -r _legacy; do
  [ -n "$_legacy" ] || continue
  _suffix="${_legacy#DEPLOW_}"
  _next="HOSTRIG_${_suffix}"
  if [ -z "${!_next:-}" ] && [ -n "${!_legacy:-}" ]; then
    printf -v "$_next" '%s' "${!_legacy}"
    export "$_next"
  fi
done < <(compgen -e | grep '^DEPLOW_' || true)
unset _legacy _suffix _next

# Prefer new home; fall back to a previous /opt/deplow install if present.
if [ -z "${HOSTRIG_HOME:-}" ]; then
  if [ -n "${DEPLOW_HOME:-}" ]; then
    HOSTRIG_HOME="$DEPLOW_HOME"
  elif [ -d /opt/deplow ] && [ ! -d /opt/hostrig ]; then
    HOSTRIG_HOME="/opt/deplow"
  else
    HOSTRIG_HOME="/opt/hostrig"
  fi
fi
HOSTRIG_VERSION="${HOSTRIG_VERSION:-latest}"
HOSTRIG_IMAGE="${HOSTRIG_IMAGE:-ghcr.io/kielerdotdev/hostrig:${HOSTRIG_VERSION}}"
HOSTRIG_ASSET_BASE="${HOSTRIG_ASSET_BASE:-https://github.com/kielerdotdev/hostrig/releases/download/install}"
HOSTRIG_WEB_PORT="${HOSTRIG_WEB_PORT:-3000}"
HOSTRIG_BUNDLE_MINIO="${HOSTRIG_BUNDLE_MINIO:-1}"
# User apps always require gVisor — runc is not an escape hatch.
if [ "${HOSTRIG_APP_RUNTIME:-runsc}" = "runc" ] || [ "${HOSTRIG_APP_RUNTIME:-}" = "default" ]; then
  echo "ERROR: HOSTRIG_APP_RUNTIME=runc is not allowed. User apps require gVisor (runsc)." >&2
  exit 1
fi
HOSTRIG_APP_RUNTIME="runsc"
HOSTRIG_APP_RUNTIME_REQUIRED="true"
COMPOSE_PROJECT="hostrig"
ACTION="${1:-install}"
IMAGE_ASSETS_PATH="/opt/hostrig-assets"

say() { printf '\n\033[1m==>\033[0m %s\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*" >&2; }
die() { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

need_root() {
  if [ "$(id -u)" -eq 0 ]; then
    return
  fi
  if docker info >/dev/null 2>&1; then
    warn "Not root — will use existing Docker (skip host package installs)"
    return
  fi
  die "Re-run as root (sudo). Example: curl -sSL …/install.sh | sudo bash"
}

can_write_host() {
  [ "$(id -u)" -eq 0 ]
}

compose() {
  # shellcheck disable=SC2086
  env COMPOSE_PROFILES="${COMPOSE_PROFILES:-}" \
    docker compose -p "$COMPOSE_PROJECT" --project-directory "$HOSTRIG_HOME" "$@"
}

detect_public_url() {
  if [ -n "${HOSTRIG_PUBLIC_URL:-}" ]; then
    printf '%s\n' "$HOSTRIG_PUBLIC_URL"
    return
  fi
  local ip=""
  ip="$(curl -4 -fsS --connect-timeout 3 https://ifconfig.me 2>/dev/null || true)"
  if [ -z "$ip" ]; then
    ip="$(curl -4 -fsS --connect-timeout 3 https://api.ipify.org 2>/dev/null || true)"
  fi
  if [ -z "$ip" ]; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  if [ -n "$ip" ]; then
    printf 'http://%s:%s\n' "$ip" "$HOSTRIG_WEB_PORT"
  else
    printf 'http://localhost:%s\n' "$HOSTRIG_WEB_PORT"
  fi
}

# ── host bootstrap ────────────────────────────────────────────────────────────

ensure_docker() {
  if have docker && docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "Docker $(docker --version | head -1)"
    return
  fi
  if ! can_write_host; then
    die "Docker is missing and installer is not root — re-run with sudo"
  fi
  say "Installing Docker Engine"
  if ! have curl; then
    if have apt-get; then apt-get update -qq && apt-get install -y -qq curl ca-certificates
    elif have dnf; then dnf install -y curl ca-certificates
    else die "curl is required to install Docker"
    fi
  fi
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker 2>/dev/null || service docker start 2>/dev/null || true
  if ! docker info >/dev/null 2>&1; then
    die "Docker installed but daemon is not reachable"
  fi
  if ! docker compose version >/dev/null 2>&1; then
    die "Docker Compose v2 plugin missing after install"
  fi
  ok "Docker installed"
}

ensure_gvisor() {
  # Control-plane host may still use Docker for builds; gVisor is required on
  # k3s nodes for user apps. Install runsc on the CP host when possible so
  # doctor/local checks pass; never fall back to runc for user apps.
  if docker info 2>/dev/null | grep -qi runsc && have runsc; then
    ok "gVisor (runsc) ready"
    return
  fi
  if ! can_write_host; then
    die "gVisor (runsc) missing and not root — re-run install with sudo. User apps require gVisor; runc is not allowed."
  fi
  say "Installing gVisor (runsc)"
  local arch url
  arch="$(uname -m)"
  case "$arch" in
    x86_64 | amd64) arch="x86_64" ;;
    aarch64 | arm64) arch="aarch64" ;;
    *) die "Unsupported arch $arch for gVisor — user apps require runsc" ;;
  esac
  url="https://storage.googleapis.com/gvisor/releases/release/latest/${arch}"
  curl -fsSL "${url}/runsc" -o /usr/local/bin/runsc
  curl -fsSL "${url}/containerd-shim-runsc-v1" -o /usr/local/bin/containerd-shim-runsc-v1 || true
  chmod +x /usr/local/bin/runsc /usr/local/bin/containerd-shim-runsc-v1 2>/dev/null || chmod +x /usr/local/bin/runsc
  mkdir -p /etc/docker
  if [ -f /etc/docker/daemon.json ]; then
    if ! grep -q '"runsc"' /etc/docker/daemon.json 2>/dev/null; then
      python3 - <<'PY' 2>/dev/null || true
import json
from pathlib import Path
p = Path("/etc/docker/daemon.json")
try:
    d = json.loads(p.read_text() or "{}")
except Exception:
    d = {}
d.setdefault("runtimes", {})["runsc"] = {"path": "/usr/local/bin/runsc"}
p.write_text(json.dumps(d, indent=2) + "\n")
PY
    fi
  else
    cat >/etc/docker/daemon.json <<'EOF'
{
  "runtimes": {
    "runsc": {
      "path": "/usr/local/bin/runsc"
    }
  }
}
EOF
  fi
  runsc install 2>/dev/null || true
  systemctl restart docker
  sleep 2
  if docker info 2>/dev/null | grep -qi runsc; then
    ok "gVisor (runsc) registered"
  else
    die "gVisor install incomplete — restart Docker and re-run install. User apps require gVisor; runc is not allowed."
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
    docker run -d --privileged --restart unless-stopped --name buildkit moby/buildkit:latest >/dev/null
  fi
  ok "BuildKit"
}

# ── image + assets ────────────────────────────────────────────────────────────

ghcr_login() {
  local token="${GHCR_TOKEN:-${GITHUB_TOKEN:-${GH_TOKEN:-}}}"
  if [ -z "$token" ]; then
    return 1
  fi
  local user="${GHCR_USER:-${GITHUB_USER:-$(whoami)}}"
  # GitHub PATs / ghs_ tokens use username; oauth gho_ works with any non-empty user for GHCR
  printf '%s' "$token" | docker login ghcr.io -u "$user" --password-stdin >/dev/null
  ok "Logged into ghcr.io"
  return 0
}

pull_image() {
  say "Pulling $HOSTRIG_IMAGE"
  if docker pull "$HOSTRIG_IMAGE"; then
    ok "Image ready"
    return
  fi
  if ghcr_login && docker pull "$HOSTRIG_IMAGE"; then
    ok "Image ready (authenticated)"
    return
  fi
  if docker image inspect "$HOSTRIG_IMAGE" >/dev/null 2>&1; then
    warn "Registry pull failed — using local image $HOSTRIG_IMAGE"
    return
  fi
  cat >&2 <<EOF

Cannot pull $HOSTRIG_IMAGE

If the package is private, set a token and re-run:
  export GHCR_TOKEN=ghp_…   # classic PAT with read:packages
  curl -sSL …/install.sh | sudo -E bash

Or make the GHCR package public (GitHub → Packages → hostrig → Package settings).
EOF
  die "Image pull failed"
}

write_file() {
  local dest="$1"
  cat >"$dest"
}

sync_assets_from_image() {
  say "Extracting deploy assets from image"
  local cid
  cid="$(docker create "$HOSTRIG_IMAGE")"
  mkdir -p "$HOSTRIG_HOME"
  if docker cp "${cid}:${IMAGE_ASSETS_PATH}/docker-compose.yml" "$HOSTRIG_HOME/docker-compose.yml" 2>/dev/null \
    && docker cp "${cid}:${IMAGE_ASSETS_PATH}/Caddyfile" "$HOSTRIG_HOME/Caddyfile" 2>/dev/null; then
    if [ ! -f "$HOSTRIG_HOME/.env" ]; then
      docker cp "${cid}:${IMAGE_ASSETS_PATH}/.env.example" "$HOSTRIG_HOME/.env" 2>/dev/null \
        || docker cp "${cid}:${IMAGE_ASSETS_PATH}/env.example" "$HOSTRIG_HOME/.env" 2>/dev/null \
        || true
    fi
    docker rm -f "$cid" >/dev/null
    ok "Assets from image"
    return 0
  fi
  docker rm -f "$cid" >/dev/null
  return 1
}

sync_assets_from_tree_or_url() {
  mkdir -p "$HOSTRIG_HOME"
  local src=""
  if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/docker-compose.yml" ] && [ -f "$SCRIPT_DIR/Caddyfile" ]; then
    src="$SCRIPT_DIR"
  fi
  if [ -n "$src" ]; then
    say "Copying deploy assets from $src"
    cp "$src/docker-compose.yml" "$HOSTRIG_HOME/docker-compose.yml"
    cp "$src/Caddyfile" "$HOSTRIG_HOME/Caddyfile"
    if [ ! -f "$HOSTRIG_HOME/.env" ] && [ -f "$src/.env.example" ]; then
      cp "$src/.env.example" "$HOSTRIG_HOME/.env"
    fi
    ok "Assets from local tree"
    return
  fi
  say "Downloading deploy assets from $HOSTRIG_ASSET_BASE"
  if ! curl -fsSL "${HOSTRIG_ASSET_BASE}/docker-compose.yml" -o "$HOSTRIG_HOME/docker-compose.yml"; then
    die "Could not download compose file (private repo?). Place install next to deploy/ assets, or use an image that embeds /opt/hostrig-assets."
  fi
  curl -fsSL "${HOSTRIG_ASSET_BASE}/Caddyfile" -o "$HOSTRIG_HOME/Caddyfile"
  if [ ! -f "$HOSTRIG_HOME/.env" ]; then
    curl -fsSL "${HOSTRIG_ASSET_BASE}/.env.example" -o "$HOSTRIG_HOME/.env"
  fi
  ok "Assets downloaded"
}

sync_assets() {
  if sync_assets_from_image; then
    return
  fi
  warn "Image has no embedded deploy assets — falling back"
  sync_assets_from_tree_or_url
}

# ── env ───────────────────────────────────────────────────────────────────────

gen_secret() {
  if have openssl; then
    openssl rand -base64 32 | tr -d '\n'
  else
    head -c 48 /urandom | base64 | tr -d '\n'
  fi
}

env_get() {
  local key="$1" envf="$HOSTRIG_HOME/.env"
  grep -E "^${key}=" "$envf" 2>/dev/null | head -1 | cut -d= -f2- || true
}

env_set() {
  local key="$1" val="$2" envf="$HOSTRIG_HOME/.env"
  if grep -q "^${key}=" "$envf" 2>/dev/null; then
    # Escape & \ for sed
    local esc
    esc="$(printf '%s' "$val" | sed -e 's/[&|\\]/\\&/g')"
    sed -i "s|^${key}=.*|${key}=${esc}|" "$envf"
  else
    printf '\n%s=%s\n' "$key" "$val" >>"$envf"
  fi
}

ensure_env() {
  local envf="$HOSTRIG_HOME/.env" public_url
  if [ ! -f "$envf" ]; then
    write_file "$envf" <<'EOF'
BETTER_AUTH_SECRET=replace-me
BETTER_AUTH_URL=http://localhost:3000
HOSTRIG_PUBLIC_URL=http://localhost:3000
HOSTRIG_SECRETS_KEY=replace-me-long-random
HOSTRIG_BASE_DOMAIN=apps.localhost
HOSTRIG_PUBLIC_URL_PROTOCOL=http
HOSTRIG_DOCKER_NETWORK=hostrig_default
HOSTRIG_APP_RUNTIME=runsc
HOSTRIG_APP_RUNTIME_REQUIRED=true
BUILDKIT_HOST=docker-container://buildkit
EOF
  fi

  say "Configuring $envf"
  public_url="$(detect_public_url)"

  local auth secrets
  auth="$(env_get BETTER_AUTH_SECRET)"
  if [ -z "$auth" ] || [ "$auth" = "replace-me" ] || [ "${#auth}" -lt 32 ]; then
    env_set BETTER_AUTH_SECRET "$(gen_secret)"
    ok "Generated BETTER_AUTH_SECRET"
  fi
  secrets="$(env_get HOSTRIG_SECRETS_KEY)"
  if [ -z "$secrets" ] || [ "$secrets" = "replace-me-long-random" ] || [ "${#secrets}" -lt 32 ]; then
    env_set HOSTRIG_SECRETS_KEY "$(gen_secret)"
    ok "Generated HOSTRIG_SECRETS_KEY"
  fi

  # Platform Redis (BullMQ) — never leave unauthenticated
  local redis_pw
  redis_pw="$(env_get HOSTRIG_REDIS_PASSWORD)"
  if [ -z "$redis_pw" ] || [ "$redis_pw" = "replace-me" ] || [ "${#redis_pw}" -lt 16 ]; then
    env_set HOSTRIG_REDIS_PASSWORD "$(gen_secret | tr -d '/+=' | head -c 32)"
    ok "Generated HOSTRIG_REDIS_PASSWORD"
  fi

  env_set HOSTRIG_IMAGE "$HOSTRIG_IMAGE"
  env_set BETTER_AUTH_URL "$public_url"
  env_set HOSTRIG_PUBLIC_URL "$public_url"
  env_set HOSTRIG_WEB_PORT "$HOSTRIG_WEB_PORT"
  env_set HOSTRIG_APP_RUNTIME "$HOSTRIG_APP_RUNTIME"
  env_set HOSTRIG_APP_RUNTIME_REQUIRED "$HOSTRIG_APP_RUNTIME_REQUIRED"
  env_set HOSTRIG_DOCKER_NETWORK "hostrig_default"
  env_set BUILDKIT_HOST "docker-container://buildkit"

  if [ "$HOSTRIG_BUNDLE_MINIO" = "1" ] || [ "$HOSTRIG_BUNDLE_MINIO" = "true" ]; then
    local access secret
    access="$(env_get HOSTRIG_S3_ACCESS_KEY)"
    secret="$(env_get HOSTRIG_S3_SECRET_KEY)"
    # Rotate empty or known-insecure placeholders (never leave hostrigsecret in prod)
    if [ -z "$secret" ] || [ "$secret" = "hostrigsecret" ] || [ "$secret" = "replace-me" ] || [ "${#secret}" -lt 16 ]; then
      secret="$(gen_secret | tr -d '/+=' | head -c 32)"
      env_set HOSTRIG_S3_SECRET_KEY "$secret"
      ok "Generated HOSTRIG_S3_SECRET_KEY (rotated weak/empty MinIO root password)"
    fi
    if [ -z "$access" ] || [ "$access" = "hostrig" ] || [ "$access" = "change-me-access-key" ]; then
      access="hostrig_$(gen_secret | tr -d '/+=' | head -c 8)"
      env_set HOSTRIG_S3_ACCESS_KEY "$access"
      ok "Generated HOSTRIG_S3_ACCESS_KEY"
    fi
    env_set HOSTRIG_S3_PROVIDER "minio"
    env_set HOSTRIG_S3_ENDPOINT "http://minio:9000"
    env_set HOSTRIG_S3_APP_ENDPOINT "http://minio:9000"
    env_set HOSTRIG_S3_REGION "us-east-1"
    env_set HOSTRIG_BACKUP_BUCKET "hostrig-backups"
    ok "Bundled MinIO (S3) configured"
  else
    ok "External S3 mode (HOSTRIG_BUNDLE_MINIO=0) — ensure HOSTRIG_S3_* is set"
  fi

  if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
    env_set CLOUDFLARE_TUNNEL_TOKEN "$CLOUDFLARE_TUNNEL_TOKEN"
    ok "Cloudflare tunnel token set"
  fi

  PUBLIC_URL="$public_url"
  ok "Public URL: $public_url"

  # Restrict .env permissions (auth secrets, S3 keys, Redis password)
  chmod 600 "$envf" 2>/dev/null || true
}

compose_profiles() {
  local profiles=()
  if [ "$HOSTRIG_BUNDLE_MINIO" = "1" ] || [ "$HOSTRIG_BUNDLE_MINIO" = "true" ]; then
    profiles+=("bundled-s3")
  fi
  if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ] || [ -n "$(env_get CLOUDFLARE_TUNNEL_TOKEN 2>/dev/null || true)" ]; then
    profiles+=("edge")
  fi
  if [ "${#profiles[@]}" -eq 0 ]; then
    COMPOSE_PROFILES=""
  else
    local IFS=,
    COMPOSE_PROFILES="${profiles[*]}"
  fi
  export COMPOSE_PROFILES
}

ensure_minio_bucket() {
  if [ "$HOSTRIG_BUNDLE_MINIO" != "1" ] && [ "$HOSTRIG_BUNDLE_MINIO" != "true" ]; then
    return
  fi
  local access secret bucket
  access="$(env_get HOSTRIG_S3_ACCESS_KEY)"
  secret="$(env_get HOSTRIG_S3_SECRET_KEY)"
  bucket="$(env_get HOSTRIG_BACKUP_BUCKET)"
  bucket="${bucket:-hostrig-backups}"
  say "Ensuring MinIO bucket '$bucket'"
  # Wait for minio healthy
  local i
  for i in $(seq 1 30); do
    if docker exec hostrig-minio curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  docker run --rm --network "${COMPOSE_PROJECT}_default" --entrypoint /bin/sh minio/mc -c \
    "mc alias set local http://minio:9000 '${access}' '${secret}' && mc mb -p local/${bucket} || true" \
    >/dev/null
  ok "Bucket ready"
}

wait_for_control_plane() {
  say "Waiting for control plane"
  local code i css
  for i in $(seq 1 90); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${HOSTRIG_WEB_PORT}/login" 2>/dev/null || true)"
    if [ "$code" = "200" ] || [ "$code" = "302" ]; then
      # Confirm CSS is actually served (the failure mode we hit in prod)
      css="$(curl -sS "http://127.0.0.1:${HOSTRIG_WEB_PORT}/login" 2>/dev/null | tr -d '\0' | sed -n 's/.*href="\(\/assets\/styles-[^"]*\.css\)".*/\1/p' | head -1 || true)"
      if [ -n "$css" ]; then
        code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${HOSTRIG_WEB_PORT}${css}" 2>/dev/null || true)"
        if [ "$code" = "200" ]; then
          ok "Control plane + CSS healthy"
          return 0
        fi
        warn "CSS $css returned $code — retrying"
      else
        ok "Control plane responding"
        return 0
      fi
    fi
    sleep 2
  done
  warn "Control plane not healthy yet — check: docker compose -p hostrig --project-directory $HOSTRIG_HOME logs web"
  return 2
}

print_done() {
  local url="${PUBLIC_URL:-http://localhost:${HOSTRIG_WEB_PORT}}"
  cat <<EOF

╔══════════════════════════════════════════╗
║          hostrig is ready                 ║
╚══════════════════════════════════════════╝

  Open:     ${url}
  Home:     ${HOSTRIG_HOME}
  Image:    ${HOSTRIG_IMAGE}

  First visit → create the admin user.
  Then Domains → set your base domain.

  Logs:    docker compose -p hostrig --project-directory ${HOSTRIG_HOME} logs -f web
  Update:  curl -sSL ${HOSTRIG_ASSET_BASE}/install.sh | sudo bash -s update
  Stop:    docker compose -p hostrig --project-directory ${HOSTRIG_HOME} down

EOF
}

do_install() {
  need_root
  say "hostrig install → $HOSTRIG_HOME"
  ensure_docker
  ensure_gvisor
  ensure_buildkit
  pull_image
  sync_assets
  ensure_env
  compose_profiles
  say "Starting stack (profiles: ${COMPOSE_PROFILES:-none})"
  compose pull || true
  compose up -d
  ensure_minio_bucket || warn "MinIO bucket setup skipped (non-fatal)"
  wait_for_control_plane || true
  print_done
}

do_update() {
  need_root
  if [ ! -f "$HOSTRIG_HOME/docker-compose.yml" ]; then
    die "No install at $HOSTRIG_HOME — run install first (no args)."
  fi
  say "hostrig update → $HOSTRIG_HOME"
  ensure_docker
  ensure_gvisor
  ensure_buildkit
  pull_image
  # Refresh compose/Caddyfile, keep .env
  say "Refreshing deploy assets (preserving .env)"
  local cid
  cid="$(docker create "$HOSTRIG_IMAGE")"
  docker cp "${cid}:${IMAGE_ASSETS_PATH}/docker-compose.yml" "$HOSTRIG_HOME/docker-compose.yml" 2>/dev/null \
    || sync_assets_from_tree_or_url
  docker cp "${cid}:${IMAGE_ASSETS_PATH}/Caddyfile" "$HOSTRIG_HOME/Caddyfile" 2>/dev/null || true
  docker rm -f "$cid" >/dev/null
  ensure_env
  compose_profiles
  say "Recreating services"
  compose pull || true
  compose up -d
  ensure_minio_bucket || true
  wait_for_control_plane || true
  print_done
}

case "$ACTION" in
  install | "") do_install ;;
  update | upgrade) do_update ;;
  *) die "Unknown action: $ACTION (use install|update)" ;;
esac
