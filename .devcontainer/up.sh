#!/usr/bin/env bash
# Host helper — sets DOCKER_GID then runs the Dev Container CLI.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/.devcontainer"

# Refresh GID file (same as initializeCommand) before reading it.
bash "$dir/initialize.sh" >/dev/null

if [ -f "$dir/.env" ]; then
  # shellcheck disable=SC1091
  set -a
  # source only sets DOCKER_GID from our tiny file
  . "$dir/.env"
  set +a
fi

export DOCKER_GID="${DOCKER_GID:-$(stat -c '%g' /var/run/docker.sock)}"
export PATH="${HOME}/.vite-plus/bin:${PATH}"
exec devcontainer up --workspace-folder "$root" "$@"
