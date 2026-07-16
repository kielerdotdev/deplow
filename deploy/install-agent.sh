#!/usr/bin/env bash
# One-shot remote node agent install for Hostrig.
#
#   curl -sSL https://<control-plane>/install-agent.sh | sudo bash -s -- \
#     --url https://hostrig.example.com \
#     --token dj_xxxx
#
# Optional:
#   DEPLOW_AGENT_HOME   install dir (default /opt/deplow-agent)
#   DEPLOW_AGENT_IMAGE  image ref (default ghcr.io/kielerdotdev/deplow-agent:latest)
#   DEPLOW_ADVERTISE_HOST  public IP/DNS for Caddy upstreams
#   DEPLOW_NODE_NAME    preferred node name
#   DEPLOW_APP_RUNTIME  runsc (default) · runc
if [ -z "${BASH_VERSION:-}" ]; then
  echo "ERROR: run with bash (curl … | bash)" >&2
  exit 1
fi
set -euo pipefail

DEPLOW_AGENT_HOME="${DEPLOW_AGENT_HOME:-/opt/deplow-agent}"
DEPLOW_AGENT_IMAGE="${DEPLOW_AGENT_IMAGE:-ghcr.io/kielerdotdev/deplow-agent:latest}"
DEPLOW_APP_RUNTIME="${DEPLOW_APP_RUNTIME:-runsc}"
DEPLOW_DOCKER_NETWORK="${DEPLOW_DOCKER_NETWORK:-deplow_agent}"
ACTION="install"
URL=""
TOKEN=""
ADVERTISE_HOST="${DEPLOW_ADVERTISE_HOST:-}"
NODE_NAME="${DEPLOW_NODE_NAME:-}"

say() { printf '\n\033[1m==>\033[0m %s\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die() { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --token) TOKEN="${2:-}"; shift 2 ;;
    --advertise-host) ADVERTISE_HOST="${2:-}"; shift 2 ;;
    --name) NODE_NAME="${2:-}"; shift 2 ;;
    --image) DEPLOW_AGENT_IMAGE="${2:-}"; shift 2 ;;
    update) ACTION="update"; shift ;;
    *) die "Unknown arg: $1" ;;
  esac
done

[ -n "$URL" ] || die "--url is required (control plane base URL)"
[ -n "$TOKEN" ] || [ -f "$DEPLOW_AGENT_HOME/.env" ] || die "--token is required for first install"

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    die "Re-run as root (sudo)."
  fi
}

ensure_docker() {
  if have docker && docker info >/dev/null 2>&1; then
    ok "Docker ready"
    return
  fi
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker 2>/dev/null || true
  docker info >/dev/null 2>&1 || die "Docker install failed"
  ok "Docker installed"
}

detect_advertise() {
  if [ -n "$ADVERTISE_HOST" ]; then
    printf '%s\n' "$ADVERTISE_HOST"
    return
  fi
  local ip=""
  ip="$(curl -4 -fsS --connect-timeout 3 https://ifconfig.me 2>/dev/null || true)"
  if [ -z "$ip" ]; then
    ip="$(curl -4 -fsS --connect-timeout 3 https://api.ipify.org 2>/dev/null || true)"
  fi
  printf '%s\n' "$ip"
}

write_compose() {
  mkdir -p "$DEPLOW_AGENT_HOME"
  local adv
  adv="$(detect_advertise)"

  cat >"$DEPLOW_AGENT_HOME/docker-compose.yml" <<EOF
services:
  agent:
    image: ${DEPLOW_AGENT_IMAGE}
    container_name: deplow-agent
    restart: unless-stopped
    network_mode: host
    env_file:
      - .env
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - agent_state:/var/lib/deplow-agent
      - agent_git:/var/lib/deplow-agent/git
volumes:
  agent_state:
  agent_git:
EOF

  if [ ! -f "$DEPLOW_AGENT_HOME/.env" ] || [ -n "$TOKEN" ]; then
    umask 077
    cat >"$DEPLOW_AGENT_HOME/.env" <<EOF
DEPLOW_URL=${URL}
DEPLOW_JOIN_TOKEN=${TOKEN}
DEPLOW_ADVERTISE_HOST=${adv}
DEPLOW_NODE_NAME=${NODE_NAME}
DEPLOW_APP_RUNTIME=${DEPLOW_APP_RUNTIME}
DEPLOW_DOCKER_NETWORK=${DEPLOW_DOCKER_NETWORK}
DEPLOW_GIT_CLONE_ROOT=/var/lib/deplow-agent/git
EOF
  fi
  ok "Wrote ${DEPLOW_AGENT_HOME}"
}

start_agent() {
  say "Starting agent"
  (cd "$DEPLOW_AGENT_HOME" && docker compose pull && docker compose up -d)
  ok "Agent running (docker compose -p default in ${DEPLOW_AGENT_HOME})"
  echo
  echo "  Control plane: ${URL}"
  echo "  Advertise:     $(detect_advertise)"
  echo "  Logs:          docker compose -f ${DEPLOW_AGENT_HOME}/docker-compose.yml logs -f"
}

need_root
ensure_docker
# Ensure a user-facing docker network exists for app containers
docker network inspect "$DEPLOW_DOCKER_NETWORK" >/dev/null 2>&1 \
  || docker network create "$DEPLOW_DOCKER_NETWORK" >/dev/null
write_compose
start_agent
ok "Done"
