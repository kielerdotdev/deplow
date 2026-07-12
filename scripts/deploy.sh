#!/usr/bin/env bash
# Thin wrapper for monorepo checkouts — prefers deploy/install.sh (pull-only).
# Prefer on a fresh VPS (no clone):
#   curl -sSL https://raw.githubusercontent.com/kielerdotdev/deplow/main/deploy/install.sh | bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export DEPLOW_HOME="${DEPLOW_HOME:-$ROOT/deploy-data}"
# Use in-tree deploy assets (compose/Caddyfile) via SCRIPT_DIR of install.sh
exec bash "$ROOT/deploy/install.sh" "${1:-install}"
