#!/usr/bin/env bash
# Once per container create — install deps and seed env.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

echo "==> corepack / pnpm"
corepack enable
corepack prepare pnpm@10.12.1 --activate

echo "==> node $(node -v) (ABI $(node -p 'process.versions.modules'))"

echo "==> pnpm install"
# Non-interactive: host node_modules may trigger "reinstall from scratch?" prompt
export CI=1
pnpm install --frozen-lockfile || pnpm install --force

# Shared bind mount: host tooling may have built native addons for another Node ABI.
echo "==> rebuild native addons for container Node"
pnpm rebuild better-sqlite3 2>/dev/null || true
# ssh2 / cpu-features may be ignored by pnpm approve-builds; best-effort.
pnpm rebuild ssh2 2>/dev/null || true

seed_env() {
  local dest="$1" example="$2"
  if [ ! -f "$dest" ] && [ -f "$example" ]; then
    echo "==> seeding $dest"
    cp "$example" "$dest"
  fi
}
seed_env apps/web/.env apps/web/.env.example
seed_env .env .env.example

echo "==> ensure railpack"
bash scripts/ensure-railpack.sh

echo "==> CLI checks"
command -v hetzner-k3s >/dev/null
command -v kubectl >/dev/null
command -v helm >/dev/null
command -v docker >/dev/null
command -v railpack >/dev/null || test -x .tools/bin/railpack
hetzner-k3s --version || true
kubectl version --client 2>/dev/null | head -1 || true
helm version --short || true
railpack --version 2>/dev/null || .tools/bin/railpack --version || true

# Drop host-only RAILPACK_BIN from bind-mounted .env
if [ -f apps/web/.env ] && grep -qE '^RAILPACK_BIN=' apps/web/.env; then
  sed -i '/^RAILPACK_BIN=/d' apps/web/.env
  echo "==> removed RAILPACK_BIN from apps/web/.env"
fi

echo "==> on-create done"
