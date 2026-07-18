#!/usr/bin/env bash
# Thin wrapper for monorepo checkouts — prefers deploy/install.sh (pull-only).
# Prefer on a fresh VPS (no clone):
#   curl -sSL https://raw.githubusercontent.com/kielerdotdev/hostrig/main/deploy/install.sh | bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export HOSTRIG_HOME="${HOSTRIG_HOME:-$ROOT/deploy-data}"
# Use in-tree deploy assets (compose/Caddyfile) via SCRIPT_DIR of install.sh
exec bash "$ROOT/deploy/install.sh" "${1:-install}"
