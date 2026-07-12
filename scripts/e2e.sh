#!/usr/bin/env bash
# End-to-end smoke against running deplow web + docker-compose infra.
# Requires: pnpm infra:up && pnpm dev (control plane on :3000)
# Optional: DEPLOY_SOURCE_DOCKERFILE / DEPLOY_SOURCE_RAILPACK absolute paths
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="$(mktemp)"
ORIGIN="$BASE"
EMAIL="e2e-$(date +%s)@example.com"
PASS="testpass123"
PROJECT="demo$(date +%s | tail -c 6)"
SCRATCH="${SCRATCH_DIR:-/tmp/deplow-e2e}"
mkdir -p "$SCRATCH"

cleanup() {
  rm -f "$COOKIE_JAR"
}
trap cleanup EXIT

rpc() {
  local path="$1"
  local body="{}"
  if [ "$#" -ge 2 ]; then
    body="$2"
  fi
  curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -X POST "$BASE/api/rpc/$path" \
    -H "Content-Type: application/json" \
    -H "Origin: $ORIGIN" \
    -d "$body"
}

json_field() {
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); const v=j.json; const path=process.argv[1].split('.'); let cur=v; for (const p of path){ if(cur==null){console.log(''); process.exit(0)}; cur=cur[p]; } console.log(cur??'');});" "$1"
}

wait_for_deploy() {
  local deploy_id="$1"
  local log_file="$2"
  local i status
  for i in $(seq 1 90); do
    DEPLOY=$(rpc "deployments/get" "{\"json\":{\"id\":\"$deploy_id\"}}")
    status=$(echo "$DEPLOY" | json_field "status")
    echo "poll=$i status=$status" | tee -a "$log_file"
    case "$status" in
      running|failed|stopped)
        echo "$DEPLOY" | tee -a "$log_file"
        if [ "$status" != "running" ]; then
          echo "ERROR: deploy ended as $status" | tee -a "$log_file"
          exit 1
        fi
        return 0
        ;;
    esac
    sleep 1
  done
  echo "ERROR: deploy timed out" | tee -a "$log_file"
  exit 1
}

wait_for_service_running() {
  local service_id="$1"
  local log_file="$2"
  local i status
  for i in $(seq 1 90); do
    SVC=$(rpc "services/get" "{\"json\":{\"id\":\"$service_id\"}}")
    status=$(echo "$SVC" | json_field "status")
    echo "service_poll=$i status=$status" | tee -a "$log_file"
    case "$status" in
      running)
        return 0
        ;;
      error)
        echo "$SVC" | tee -a "$log_file"
        echo "ERROR: service provision failed" | tee -a "$log_file"
        exit 1
        ;;
    esac
    sleep 1
  done
  echo "ERROR: service provision timed out" | tee -a "$log_file"
  exit 1
}

echo "==> Health" | tee "$SCRATCH/provision.log"
HEALTH=$(rpc "health")
echo "$HEALTH" | tee -a "$SCRATCH/provision.log"
echo "$HEALTH" | grep -q '"ok":true'

echo "==> Sign up $EMAIL" | tee -a "$SCRATCH/provision.log"
SIGNUP=$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/sign-up/email" \
  -H "Content-Type: application/json" -H "Origin: $ORIGIN" \
  -d "{\"name\":\"E2E\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
echo "$SIGNUP" | tee -a "$SCRATCH/provision.log"
echo "$SIGNUP" | grep -q "$EMAIL"

echo "==> Ensure local node" | tee -a "$SCRATCH/provision.log"
NODE=$(rpc "nodes/ensureLocal")
echo "$NODE" | tee -a "$SCRATCH/provision.log"
NODE_ID=$(echo "$NODE" | json_field "id")
test -n "$NODE_ID"

echo "==> Configure Domains (ingress)" | tee -a "$SCRATCH/provision.log"
INGRESS=$(rpc "platform/ingressUpdate" '{"json":{"baseDomain":"apps.localhost","publicProtocol":"http","autoDomainsEnabled":true}}')
echo "$INGRESS" | tee -a "$SCRATCH/provision.log"
echo "$INGRESS" | grep -q 'apps.localhost'

PROXY_STATUS=$(rpc "platform/proxyStatus")
echo "$PROXY_STATUS" | tee -a "$SCRATCH/provision.log"
echo "$PROXY_STATUS" | grep -q '"caddyReachable":true\|"caddyReachable": true'

echo "==> Create project $PROJECT" | tee -a "$SCRATCH/provision.log"
CREATE=$(rpc "projects/create" "{\"json\":{\"name\":\"$PROJECT\"}}")
echo "$CREATE" | tee -a "$SCRATCH/provision.log"
PROJECT_ID=$(echo "$CREATE" | json_field "id")
PROJECT_SLUG=$(echo "$CREATE" | json_field "slug")
test -n "$PROJECT_ID"
test -n "$PROJECT_SLUG"

echo "==> Create postgres + redis + web services" | tee -a "$SCRATCH/provision.log"
PG=$(rpc "services/create" "{\"json\":{\"projectId\":\"$PROJECT_ID\",\"name\":\"db\",\"type\":\"postgres\"}}")
echo "$PG" | tee -a "$SCRATCH/provision.log"
PG_ID=$(echo "$PG" | json_field "id")
test -n "$PG_ID"

REDIS=$(rpc "services/create" "{\"json\":{\"projectId\":\"$PROJECT_ID\",\"name\":\"cache\",\"type\":\"redis\"}}")
echo "$REDIS" | tee -a "$SCRATCH/provision.log"
REDIS_ID=$(echo "$REDIS" | json_field "id")
test -n "$REDIS_ID"

WEB=$(rpc "services/create" "{\"json\":{\"projectId\":\"$PROJECT_ID\",\"name\":\"web\",\"type\":\"web\",\"containerPort\":5678}}")
echo "$WEB" | tee -a "$SCRATCH/provision.log"
WEB_ID=$(echo "$WEB" | json_field "id")
test -n "$WEB_ID"

echo "==> Wait for data services" | tee -a "$SCRATCH/provision.log"
wait_for_service_running "$PG_ID" "$SCRATCH/provision.log"
wait_for_service_running "$REDIS_ID" "$SCRATCH/provision.log"

echo "==> Bind DATABASE_URL + REDIS_URL" | tee -a "$SCRATCH/provision.log"
rpc "bindings/create" "{\"json\":{\"consumerServiceId\":\"$WEB_ID\",\"providerServiceId\":\"$PG_ID\",\"envKey\":\"DATABASE_URL\"}}" \
  | tee -a "$SCRATCH/provision.log"
rpc "bindings/create" "{\"json\":{\"consumerServiceId\":\"$WEB_ID\",\"providerServiceId\":\"$REDIS_ID\",\"envKey\":\"REDIS_URL\"}}" \
  | tee -a "$SCRATCH/provision.log"

echo "==> On-demand backup (postgres)" | tee "$SCRATCH/backup.log"
BACKUP=$(rpc "projects/backup" "{\"json\":{\"id\":\"$PROJECT_ID\",\"resourceLinkId\":\"$PG_ID\"}}")
echo "$BACKUP" | tee -a "$SCRATCH/backup.log"
echo "$BACKUP" | grep -q 'completed'
echo "$BACKUP" | grep -q 'postgres\|snapshot'

echo "==> Backup schedule registered" | tee -a "$SCRATCH/backup.log"
SCHED=$(rpc "projects/backupSchedule" "{\"json\":{\"id\":\"$PROJECT_ID\"}}")
echo "$SCHED" | tee -a "$SCRATCH/backup.log"
echo "$SCHED" | grep -q '"scheduled":true\|"scheduled": true'

echo "==> Deploy prebuilt image" | tee "$SCRATCH/deploy-image.log"
DEPLOY=$(rpc "deployments/create" "{\"json\":{\"serviceId\":\"$WEB_ID\",\"image\":\"hashicorp/http-echo:1.0\",\"options\":{\"image\":\"hashicorp/http-echo:1.0\",\"containerPort\":5678,\"command\":[\"-text=deplow-e2e\",\"-listen=:5678\"]}}}")
echo "$DEPLOY" | tee -a "$SCRATCH/deploy-image.log"
DEPLOY_ID=$(echo "$DEPLOY" | json_field "id")
test -n "$DEPLOY_ID"
echo "$DEPLOY" | grep -qE 'queued|building|deploying|running|analyzing'
wait_for_deploy "$DEPLOY_ID" "$SCRATCH/deploy-image.log"

DEPLOY=$(rpc "deployments/get" "{\"json\":{\"id\":\"$DEPLOY_ID\"}}")
CID=$(echo "$DEPLOY" | json_field "containerId")
test -n "$CID"
docker inspect "$CID" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | tee -a "$SCRATCH/deploy-image.log" | grep -q 'DATABASE_URL='
docker inspect "$CID" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -q 'REDIS_URL='
CAPDROP=$(docker inspect "$CID" --format '{{json .HostConfig.CapDrop}}')
echo "capDrop=$CAPDROP" | tee -a "$SCRATCH/deploy-image.log"
RUNTIME="${DEPLOW_APP_RUNTIME:-runsc}"
if [ "$RUNTIME" = "runsc" ] || [ "$RUNTIME" = "gvisor" ]; then
  echo "$CAPDROP" | grep -q 'ALL'
else
  echo "skip CapDrop=ALL assert (runtime=$RUNTIME)" | tee -a "$SCRATCH/deploy-image.log"
fi

ROUTE_FILE="$ROOT/infra/caddy/routes/${WEB_ID}.caddy"
if [ -f "$ROUTE_FILE" ]; then
  echo "==> Proxy route registered" | tee -a "$SCRATCH/deploy-image.log"
  cat "$ROUTE_FILE" | tee -a "$SCRATCH/deploy-image.log"
else
  echo "ERROR: proxy route file missing at $ROUTE_FILE" | tee -a "$SCRATCH/deploy-image.log"
  exit 1
fi

HOST_HEADER="${PROJECT_SLUG}.apps.localhost"
echo "==> Caddy Host route Host=$HOST_HEADER via :8088" | tee -a "$SCRATCH/deploy-image.log"
docker exec deplow-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 \
  | tee -a "$SCRATCH/deploy-image.log" || true
sleep 1
PROXY_BODY=$(curl -sS -H "Host: $HOST_HEADER" "http://127.0.0.1:8088/" || true)
echo "proxy_body=$PROXY_BODY" | tee -a "$SCRATCH/deploy-image.log"
echo "$PROXY_BODY" | grep -q 'deplow-e2e'

echo "==> List projects" | tee -a "$SCRATCH/provision.log"
LIST=$(rpc "projects/list")
echo "$LIST" | tee -a "$SCRATCH/provision.log"
echo "$LIST" | grep -q "$PROJECT"

echo "==> Destroy project" | tee "$SCRATCH/destroy.log"
DESTROY=$(rpc "projects/destroy" "{\"json\":{\"id\":\"$PROJECT_ID\"}}")
echo "$DESTROY" | tee -a "$SCRATCH/destroy.log"
echo "$DESTROY" | grep -q 'ok\|true'

REMAINING=$(docker ps -aq --filter "label=deplow.projectId=$PROJECT_ID" | wc -l | tr -d ' ')
echo "remaining_containers=$REMAINING" | tee -a "$SCRATCH/destroy.log"
test "$REMAINING" = "0"

if [ -f "$ROUTE_FILE" ]; then
  echo "proxy route still present after destroy" | tee -a "$SCRATCH/destroy.log"
  exit 1
fi
echo "proxy_route_removed=ok" | tee -a "$SCRATCH/destroy.log"

PROXY_AFTER=$(curl -sS -H "Host: $HOST_HEADER" "http://127.0.0.1:8088/" || true)
echo "proxy_after=$PROXY_AFTER" | tee -a "$SCRATCH/destroy.log"
if echo "$PROXY_AFTER" | grep -q 'deplow-e2e'; then
  echo "ERROR: Caddy still serving destroyed app" | tee -a "$SCRATCH/destroy.log"
  exit 1
fi

echo ""
echo "=============================="
echo "E2E PASSED"
echo "=============================="
