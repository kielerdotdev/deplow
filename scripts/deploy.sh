#!/usr/bin/env bash
# One-shot production deploy: host deps + compose (infra + control plane).
# Prefer this on a VPS. For local hacking use scripts/install.sh + pnpm dev.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say() { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
ok() { printf 'OK: %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

IMAGE="${DEPLOW_IMAGE:-ghcr.io/kielerdotdev/deplow:latest}"
BUILD_LOCAL="${DEPLOW_BUILD_LOCAL:-0}"
PULL="${DEPLOW_PULL:-1}"

if ! have docker; then
  echo "Docker Engine is required."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Cannot talk to Docker daemon."
  exit 1
fi

if [ ! -f .env ]; then
  say "Creating .env from .env.example"
  cp .env.example .env
  if have openssl; then
    SECRET="$(openssl rand -base64 32)"
    SECRETS_KEY="$(openssl rand -base64 32)"
    sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$SECRET|" .env
    sed -i "s|^DEPLOW_SECRETS_KEY=.*|DEPLOW_SECRETS_KEY=$SECRETS_KEY|" .env
  else
    warn "Set BETTER_AUTH_SECRET and DEPLOW_SECRETS_KEY in .env"
  fi
  if ! grep -q '^DATABASE_URL=' .env; then
    printf '\nDATABASE_URL=/data/deplow.db\n' >> .env
  else
    sed -i 's|^DATABASE_URL=.*|DATABASE_URL=/data/deplow.db|' .env
  fi
fi

# Refresh placeholder secrets (compose env_file only — do not export empties into the shell)
auth_secret="$(grep -E '^BETTER_AUTH_SECRET=' .env | head -1 | cut -d= -f2- || true)"
if [ -z "$auth_secret" ] || [ "$auth_secret" = "replace-me" ] || [ "${#auth_secret}" -lt 32 ]; then
  say "Generating BETTER_AUTH_SECRET (>=32 chars)"
  SECRET="$(openssl rand -base64 32)"
  if grep -q '^BETTER_AUTH_SECRET=' .env; then
    sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$SECRET|" .env
  else
    printf '\nBETTER_AUTH_SECRET=%s\n' "$SECRET" >> .env
  fi
fi
secrets_key="$(grep -E '^DEPLOW_SECRETS_KEY=' .env | head -1 | cut -d= -f2- || true)"
if [ -z "$secrets_key" ] || [ "$secrets_key" = "replace-me-long-random" ] || [ "${#secrets_key}" -lt 32 ]; then
  SECRETS_KEY="$(openssl rand -base64 32)"
  if grep -q '^DEPLOW_SECRETS_KEY=' .env; then
    sed -i "s|^DEPLOW_SECRETS_KEY=.*|DEPLOW_SECRETS_KEY=$SECRETS_KEY|" .env
  else
    printf '\nDEPLOW_SECRETS_KEY=%s\n' "$SECRETS_KEY" >> .env
  fi
fi

# Avoid empty shell exports overriding compose env_file values
unset BETTER_AUTH_SECRET DEPLOW_SECRETS_KEY 2>/dev/null || true

# Ensure BuildKit for Railpack builds from the control plane
if ! docker ps --format '{{.Names}}' | grep -qx buildkit; then
  say "Starting BuildKit"
  if docker ps -a --format '{{.Names}}' | grep -qx buildkit; then
    docker start buildkit >/dev/null
  else
    docker run --rm --privileged -d --name buildkit moby/buildkit >/dev/null
  fi
fi
ok "BuildKit"

mkdir -p data data/git-clones infra/caddy/routes

export DEPLOW_IMAGE="$IMAGE"

if [ "$BUILD_LOCAL" = "1" ]; then
  say "Building control-plane image locally"
  docker compose build web
elif [ "$PULL" = "1" ]; then
  say "Pulling $IMAGE"
  if ! docker pull "$IMAGE"; then
    warn "Pull failed — building locally (set DEPLOW_BUILD_LOCAL=1 to skip pull)"
    docker compose build web
  fi
fi

say "Starting platform + control plane"
docker compose --profile app up -d

say "Waiting for control plane"
ok_http=0
for _ in $(seq 1 60); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login 2>/dev/null || true)"
  if [ "$code" = "200" ] || [ "$code" = "302" ]; then
    ok_http=1
    break
  fi
  sleep 2
done

cat <<EOF

==============================
Deploy complete
==============================

Control plane:  http://localhost:3000
Caddy (apps):   http://127.0.0.1:8088  (Host: {slug}.{baseDomain})
Image:          $IMAGE

Next:
  1. Open http://localhost:3000 and create the first user
  2. Domains → set base domain (apps.example.com or apps.localhost)
  3. Optional edge: CLOUDFLARE_TUNNEL_TOKEN=... docker compose --profile edge up -d
  4. Ensure gVisor on the host (runsc) for sandboxed user apps — see docs/secure-runtime.md

Host bootstrap (Railpack/gVisor on the host, not only in the image):
  bash scripts/install.sh

Logs:  docker compose logs -f web
Stop:  docker compose down
EOF

if [ "$ok_http" -ne 1 ]; then
  warn "Control plane did not return HTTP 200 on /login yet — check: docker compose logs web"
  exit 2
fi
ok "Control plane responding"
