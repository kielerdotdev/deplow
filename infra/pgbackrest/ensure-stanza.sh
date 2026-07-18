#!/usr/bin/env bash
# Ensure a pgBackRest stanza exists for a project Postgres volume.
#
# Usage:
#   ./infra/pgbackrest/ensure-stanza.sh <project-id> <project-slug> [pg-user]
#
# Requires: docker, MinIO up (compose), HOSTRIG_PITR_ENABLED=1 on the control plane.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONF="${PGBACKREST_CONFIG:-$ROOT/infra/pgbackrest/pgbackrest.conf}"
IMAGE="${HOSTRIG_PGBACKREST_IMAGE:-woblerr/pgbackrest:2.58.0-alpine}"
PROJECT_ID="${1:?project id required}"
PROJECT_SLUG="${2:?project slug required}"
PG_USER="${3:-p_${PROJECT_SLUG}}"
VOLUME="hostrig-pg-${PROJECT_SLUG}-data"
CONTAINER="hostrig-pg-${PROJECT_SLUG}"

if [[ ! -f "$CONF" ]]; then
  echo "missing config: $CONF" >&2
  exit 1
fi

if ! grep -q "^\[${PROJECT_ID}\]$" "$CONF"; then
  cat >>"$CONF" <<EOF

[${PROJECT_ID}]
pg1-path=/var/lib/postgresql/data
pg1-port=5432
pg1-user=${PG_USER}
pg1-database=d_${PROJECT_SLUG}
EOF
  echo "appended stanza [${PROJECT_ID}] to $CONF"
fi

if ! docker volume inspect "$VOLUME" >/dev/null 2>&1; then
  echo "volume $VOLUME not found — provision the project Postgres service first" >&2
  exit 1
fi

run_pgbackrest() {
  docker run --rm --entrypoint pgbackrest \
    --network host \
    -v "${VOLUME}:/var/lib/postgresql/data" \
    -v "${CONF}:/etc/pgbackrest/pgbackrest.conf:ro" \
    -e PGBACKREST_CONFIG=/etc/pgbackrest/pgbackrest.conf \
    "$IMAGE" \
    "$@"
}

echo "stopping $CONTAINER for stanza-create (volume kept)…"
docker stop "$CONTAINER" >/dev/null 2>&1 || true

docker pull -q "$IMAGE" >/dev/null
run_pgbackrest stanza-create --stanza="$PROJECT_ID" --no-online

echo "starting $CONTAINER…"
docker start "$CONTAINER" >/dev/null

echo "stanza $PROJECT_ID ready"
run_pgbackrest info --stanza="$PROJECT_ID"
echo
