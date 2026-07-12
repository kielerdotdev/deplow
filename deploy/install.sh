#!/usr/bin/env bash
# One-shot VPS install / update for deplow.
#
#   curl -sSL https://github.com/kielerdotdev/deplow/releases/download/install/install.sh | sudo bash
#
# That is the whole install. Docker, gVisor, MinIO, secrets, public URL, pull, start.
#
# Update later:
#   curl -sSL https://github.com/kielerdotdev/deplow/releases/download/install/install.sh | sudo bash -s update
#
# Optional env:
#   DEPLOW_HOME              install dir (default /opt/deplow)
#   DEPLOW_VERSION           image tag (default latest)
#   DEPLOW_IMAGE             full image ref (overrides version)
#   DEPLOW_PUBLIC_URL        e.g. http://1.2.3.4:3000 (auto-detected if unset)
#   DEPLOW_WEB_PORT          host port (default 3000)
#   DEPLOW_BUNDLE_MINIO      1 (default) bundle MinIO · 0 use external S3 only
#   DEPLOW_APP_RUNTIME       runsc (default) · runc to skip gVisor
#   GHCR_TOKEN / GITHUB_TOKEN  pull private ghcr.io/kielerdotdev/deplow
#   CLOUDFLARE_TUNNEL_TOKEN  also starts cloudflared (edge profile)
#   DEPLOW_ASSET_BASE        override raw asset URL (private-repo fallback)
if [ -z "${BASH_VERSION:-}" ]; then
  echo "ERROR: run with bash (curl … | bash)" >&2
  exit 1
fi
set -euo pipefail

DEPLOW_HOME="${DEPLOW_HOME:-/opt/deplow}"
DEPLOW_VERSION="${DEPLOW_VERSION:-latest}"
DEPLOW_IMAGE="${DEPLOW_IMAGE:-ghcr.io/kielerdotdev/deplow:${DEPLOW_VERSION}}"
DEPLOW_ASSET_BASE="${DEPLOW_ASSET_BASE:-https://github.com/kielerdotdev/deplow/releases/download/install}"
DEPLOW_WEB_PORT="${DEPLOW_WEB_PORT:-3000}"
DEPLOW_BUNDLE_MINIO="${DEPLOW_BUNDLE_MINIO:-1}"
DEPLOW_APP_RUNTIME="${DEPLOW_APP_RUNTIME:-runsc}"
DEPLOW_APP_RUNTIME_REQUIRED="${DEPLOW_APP_RUNTIME_REQUIRED:-true}"
COMPOSE_PROJECT="deplow"
ACTION="${1:-install}"
IMAGE_ASSETS_PATH="/opt/deplow-assets"

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
    docker compose -p "$COMPOSE_PROJECT" --project-directory "$DEPLOW_HOME" "$@"
}

detect_public_url() {
  if [ -n "${DEPLOW_PUBLIC_URL:-}" ]; then
    printf '%s\n' "$DEPLOW_PUBLIC_URL"
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
    printf 'http://%s:%s\n' "$ip" "$DEPLOW_WEB_PORT"
  else
    printf 'http://localhost:%s\n' "$DEPLOW_WEB_PORT"
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
  if [ "$DEPLOW_APP_RUNTIME" != "runsc" ]; then
    ok "Skipping gVisor (DEPLOW_APP_RUNTIME=$DEPLOW_APP_RUNTIME)"
    return
  fi
  if docker info 2>/dev/null | grep -qi runsc && have runsc; then
    ok "gVisor (runsc) ready"
    return
  fi
  if ! can_write_host; then
    warn "gVisor missing and not root — set DEPLOW_APP_RUNTIME=runc or re-run with sudo"
    DEPLOW_APP_RUNTIME=runc
    DEPLOW_APP_RUNTIME_REQUIRED=false
    return
  fi
  say "Installing gVisor (runsc)"
  local arch url
  arch="$(uname -m)"
  case "$arch" in
    x86_64 | amd64) arch="x86_64" ;;
    aarch64 | arm64) arch="aarch64" ;;
    *) warn "Unsupported arch $arch — set DEPLOW_APP_RUNTIME=runc to continue without gVisor"
       DEPLOW_APP_RUNTIME=runc
       DEPLOW_APP_RUNTIME_REQUIRED=false
       return
       ;;
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
    warn "gVisor install may need a manual Docker restart — falling back to runc for now"
    DEPLOW_APP_RUNTIME=runc
    DEPLOW_APP_RUNTIME_REQUIRED=false
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
  say "Pulling $DEPLOW_IMAGE"
  if docker pull "$DEPLOW_IMAGE"; then
    ok "Image ready"
    return
  fi
  if ghcr_login && docker pull "$DEPLOW_IMAGE"; then
    ok "Image ready (authenticated)"
    return
  fi
  if docker image inspect "$DEPLOW_IMAGE" >/dev/null 2>&1; then
    warn "Registry pull failed — using local image $DEPLOW_IMAGE"
    return
  fi
  cat >&2 <<EOF

Cannot pull $DEPLOW_IMAGE

If the package is private, set a token and re-run:
  export GHCR_TOKEN=ghp_…   # classic PAT with read:packages
  curl -sSL …/install.sh | sudo -E bash

Or make the GHCR package public (GitHub → Packages → deplow → Package settings).
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
  cid="$(docker create "$DEPLOW_IMAGE")"
  mkdir -p "$DEPLOW_HOME"
  if docker cp "${cid}:${IMAGE_ASSETS_PATH}/docker-compose.yml" "$DEPLOW_HOME/docker-compose.yml" 2>/dev/null \
    && docker cp "${cid}:${IMAGE_ASSETS_PATH}/Caddyfile" "$DEPLOW_HOME/Caddyfile" 2>/dev/null; then
    if [ ! -f "$DEPLOW_HOME/.env" ]; then
      docker cp "${cid}:${IMAGE_ASSETS_PATH}/.env.example" "$DEPLOW_HOME/.env" 2>/dev/null \
        || docker cp "${cid}:${IMAGE_ASSETS_PATH}/env.example" "$DEPLOW_HOME/.env" 2>/dev/null \
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
    ok "Assets from local tree"
    return
  fi
  say "Downloading deploy assets from $DEPLOW_ASSET_BASE"
  if ! curl -fsSL "${DEPLOW_ASSET_BASE}/docker-compose.yml" -o "$DEPLOW_HOME/docker-compose.yml"; then
    die "Could not download compose file (private repo?). Place install next to deploy/ assets, or use an image that embeds /opt/deplow-assets."
  fi
  curl -fsSL "${DEPLOW_ASSET_BASE}/Caddyfile" -o "$DEPLOW_HOME/Caddyfile"
  if [ ! -f "$DEPLOW_HOME/.env" ]; then
    curl -fsSL "${DEPLOW_ASSET_BASE}/.env.example" -o "$DEPLOW_HOME/.env"
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
  local key="$1" envf="$DEPLOW_HOME/.env"
  grep -E "^${key}=" "$envf" 2>/dev/null | head -1 | cut -d= -f2- || true
}

env_set() {
  local key="$1" val="$2" envf="$DEPLOW_HOME/.env"
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
  local envf="$DEPLOW_HOME/.env" public_url
  if [ ! -f "$envf" ]; then
    write_file "$envf" <<'EOF'
BETTER_AUTH_SECRET=replace-me
BETTER_AUTH_URL=http://localhost:3000
DEPLOW_PUBLIC_URL=http://localhost:3000
DEPLOW_SECRETS_KEY=replace-me-long-random
DEPLOW_BASE_DOMAIN=apps.localhost
DEPLOW_PUBLIC_URL_PROTOCOL=http
DEPLOW_DOCKER_NETWORK=deplow_default
DEPLOW_APP_RUNTIME=runsc
DEPLOW_APP_RUNTIME_REQUIRED=true
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
  secrets="$(env_get DEPLOW_SECRETS_KEY)"
  if [ -z "$secrets" ] || [ "$secrets" = "replace-me-long-random" ] || [ "${#secrets}" -lt 32 ]; then
    env_set DEPLOW_SECRETS_KEY "$(gen_secret)"
    ok "Generated DEPLOW_SECRETS_KEY"
  fi

  env_set DEPLOW_IMAGE "$DEPLOW_IMAGE"
  env_set BETTER_AUTH_URL "$public_url"
  env_set DEPLOW_PUBLIC_URL "$public_url"
  env_set DEPLOW_WEB_PORT "$DEPLOW_WEB_PORT"
  env_set DEPLOW_APP_RUNTIME "$DEPLOW_APP_RUNTIME"
  env_set DEPLOW_APP_RUNTIME_REQUIRED "$DEPLOW_APP_RUNTIME_REQUIRED"
  env_set DEPLOW_DOCKER_NETWORK "deplow_default"
  env_set BUILDKIT_HOST "docker-container://buildkit"

  if [ "$DEPLOW_BUNDLE_MINIO" = "1" ] || [ "$DEPLOW_BUNDLE_MINIO" = "true" ]; then
    local access secret
    access="$(env_get DEPLOW_S3_ACCESS_KEY)"
    secret="$(env_get DEPLOW_S3_SECRET_KEY)"
    if [ -z "$access" ]; then
      access="deplow"
      env_set DEPLOW_S3_ACCESS_KEY "$access"
    fi
    if [ -z "$secret" ] || [ "$secret" = "deplowsecret" ]; then
      # Keep stable on re-install if already set; otherwise generate
      if [ -z "$secret" ]; then
        secret="$(gen_secret | tr -d '/+=' | head -c 32)"
        env_set DEPLOW_S3_SECRET_KEY "$secret"
      fi
    fi
    # MinIO root password must be >= 8 chars — gen_secret is fine
    if [ "${#secret}" -lt 8 ]; then
      secret="$(gen_secret | tr -d '/+=' | head -c 32)"
      env_set DEPLOW_S3_SECRET_KEY "$secret"
    fi
    env_set DEPLOW_S3_PROVIDER "minio"
    env_set DEPLOW_S3_ENDPOINT "http://minio:9000"
    env_set DEPLOW_S3_APP_ENDPOINT "http://minio:9000"
    env_set DEPLOW_S3_REGION "us-east-1"
    env_set DEPLOW_BACKUP_BUCKET "deplow-backups"
    ok "Bundled MinIO (S3) configured"
  else
    ok "External S3 mode (DEPLOW_BUNDLE_MINIO=0) — ensure DEPLOW_S3_* is set"
  fi

  if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
    env_set CLOUDFLARE_TUNNEL_TOKEN "$CLOUDFLARE_TUNNEL_TOKEN"
    ok "Cloudflare tunnel token set"
  fi

  PUBLIC_URL="$public_url"
  ok "Public URL: $public_url"
}

compose_profiles() {
  local profiles=()
  if [ "$DEPLOW_BUNDLE_MINIO" = "1" ] || [ "$DEPLOW_BUNDLE_MINIO" = "true" ]; then
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
  if [ "$DEPLOW_BUNDLE_MINIO" != "1" ] && [ "$DEPLOW_BUNDLE_MINIO" != "true" ]; then
    return
  fi
  local access secret bucket
  access="$(env_get DEPLOW_S3_ACCESS_KEY)"
  secret="$(env_get DEPLOW_S3_SECRET_KEY)"
  bucket="$(env_get DEPLOW_BACKUP_BUCKET)"
  bucket="${bucket:-deplow-backups}"
  say "Ensuring MinIO bucket '$bucket'"
  # Wait for minio healthy
  local i
  for i in $(seq 1 30); do
    if docker exec deplow-minio curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1; then
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
    code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${DEPLOW_WEB_PORT}/login" 2>/dev/null || true)"
    if [ "$code" = "200" ] || [ "$code" = "302" ]; then
      # Confirm CSS is actually served (the failure mode we hit in prod)
      css="$(curl -sS "http://127.0.0.1:${DEPLOW_WEB_PORT}/login" 2>/dev/null | tr -d '\0' | sed -n 's/.*href="\(\/assets\/styles-[^"]*\.css\)".*/\1/p' | head -1 || true)"
      if [ -n "$css" ]; then
        code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${DEPLOW_WEB_PORT}${css}" 2>/dev/null || true)"
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
  warn "Control plane not healthy yet — check: docker compose -p deplow --project-directory $DEPLOW_HOME logs web"
  return 2
}

print_done() {
  local url="${PUBLIC_URL:-http://localhost:${DEPLOW_WEB_PORT}}"
  cat <<EOF

╔══════════════════════════════════════════╗
║          deplow is ready                 ║
╚══════════════════════════════════════════╝

  Open:     ${url}
  Home:     ${DEPLOW_HOME}
  Image:    ${DEPLOW_IMAGE}

  First visit → create the admin user.
  Then Domains → set your base domain.

  Logs:    docker compose -p deplow --project-directory ${DEPLOW_HOME} logs -f web
  Update:  curl -sSL ${DEPLOW_ASSET_BASE}/install.sh | sudo bash -s update
  Stop:    docker compose -p deplow --project-directory ${DEPLOW_HOME} down

EOF
}

do_install() {
  need_root
  say "deplow install → $DEPLOW_HOME"
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
  if [ ! -f "$DEPLOW_HOME/docker-compose.yml" ]; then
    die "No install at $DEPLOW_HOME — run install first (no args)."
  fi
  say "deplow update → $DEPLOW_HOME"
  ensure_docker
  ensure_gvisor
  ensure_buildkit
  pull_image
  # Refresh compose/Caddyfile, keep .env
  say "Refreshing deploy assets (preserving .env)"
  local cid
  cid="$(docker create "$DEPLOW_IMAGE")"
  docker cp "${cid}:${IMAGE_ASSETS_PATH}/docker-compose.yml" "$DEPLOW_HOME/docker-compose.yml" 2>/dev/null \
    || sync_assets_from_tree_or_url
  docker cp "${cid}:${IMAGE_ASSETS_PATH}/Caddyfile" "$DEPLOW_HOME/Caddyfile" 2>/dev/null || true
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
