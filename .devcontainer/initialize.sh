#!/usr/bin/env bash
# Runs on the host before the container is created / started.
set -euo pipefail

dir="$(cd "$(dirname "$0")" && pwd)"
gid="$(stat -c '%g' /var/run/docker.sock 2>/dev/null || true)"

if [ -z "${gid:-}" ]; then
  echo "WARN: /var/run/docker.sock not found; docker-outside-of-docker may fail."
  exit 0
fi

echo "$gid" >"$dir/.docker-gid"
# Sourced by up.sh; also lets tools that load .devcontainer/.env pick up DOCKER_GID.
printf 'DOCKER_GID=%s\n' "$gid" >"$dir/.env"

if [ -z "${DOCKER_GID:-}" ]; then
  echo "NOTE: DOCKER_GID is unset. Host Docker has no-new-privileges; the container"
  echo "      must join the socket group or postStart cannot talk to Docker."
  echo "      Prefer:  .devcontainer/up.sh"
  echo "      Or:       DOCKER_GID=$gid devcontainer up --workspace-folder ."
fi
