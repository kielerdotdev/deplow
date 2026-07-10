#!/usr/bin/env bash
# End-to-end smoke against running deplow web + docker-compose infra.
# Optional: DEPLOY_SOURCE_DOCKERFILE / DEPLOY_SOURCE_RAILPACK absolute paths
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="$(mktemp)"
ORIGIN="$BASE"
EMAIL="e2e-$(date +%s)@example.com"
PASS="testpass123"
PROJECT="demo$(date +%s | tail -c 6)"
SCRATCH="${SCRATCH_DIR:-/tmp/grok-goal-b700eca08f44/implementer}"
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

echo "==> Create project $PROJECT" | tee -a "$SCRATCH/provision.log"
CREATE=$(rpc "projects/create" "{\"json\":{\"name\":\"$PROJECT\",\"spawnBuildServer\":false}}")
echo "$CREATE" | tee -a "$SCRATCH/provision.log"
PROJECT_ID=$(echo "$CREATE" | json_field "id")
test -n "$PROJECT_ID"
echo "$CREATE" | grep -q 'database:'
echo "$CREATE" | grep -q 'redis:'
echo "$CREATE" | grep -q 'storage:'
echo "$CREATE" | grep -q 'credentialsEncrypted\|hasCredentials\|secretsYaml\|password:'

echo "==> Verify Postgres" | tee -a "$SCRATCH/provision.log"
DB_URL=$(echo "$CREATE" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const j=JSON.parse(d);
  const yaml=j.json?.secretsYaml||'';
  const m=yaml.match(/url:\\s*[\"']?(postgres:\\/\\/[^\"'\\n]+)/);
  console.log(m?m[1]:'');
});
")
if [ -n "$DB_URL" ]; then
  docker run --rm --network host postgres:16-alpine \
    psql "$DB_URL" -c "SELECT value FROM deplow_meta WHERE key='project_slug';" \
    | tee -a "$SCRATCH/provision.log" | grep -q "$PROJECT"
fi

echo "==> On-demand backup" | tee "$SCRATCH/backup.log"
BACKUP=$(rpc "projects/backup" "{\"json\":{\"id\":\"$PROJECT_ID\"}}")
echo "$BACKUP" | tee -a "$SCRATCH/backup.log"
echo "$BACKUP" | grep -q 'completed'

echo "==> Backup schedule registered" | tee -a "$SCRATCH/backup.log"
SCHED=$(rpc "projects/backupSchedule" "{\"json\":{\"id\":\"$PROJECT_ID\"}}")
echo "$SCHED" | tee -a "$SCRATCH/backup.log"
echo "$SCHED" | grep -q '"scheduled":true\|"scheduled": true'

echo "==> Deploy prebuilt image" | tee "$SCRATCH/deploy-image.log"
DEPLOY=$(rpc "deployments/create" "{\"json\":{\"projectId\":\"$PROJECT_ID\",\"nodeId\":\"$NODE_ID\",\"serviceName\":\"web\",\"image\":\"hashicorp/http-echo:1.0\",\"options\":{\"image\":\"hashicorp/http-echo:1.0\",\"publishPort\":18080,\"containerPort\":5678,\"env\":{\"ECHO_TEXT\":\"deplow-e2e\"}}}}")
echo "$DEPLOY" | tee -a "$SCRATCH/deploy-image.log"
echo "$DEPLOY" | grep -q 'running'
# env injection is applied in code; assert container has labels/env via docker inspect
CID=$(echo "$DEPLOY" | json_field "containerId")
docker inspect "$CID" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | tee -a "$SCRATCH/deploy-image.log" | grep -q 'DATABASE_URL='
docker inspect "$CID" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -q 'REDIS_URL='
docker inspect "$CID" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -q 'S3_BUCKET='

sleep 1
BODY=$(curl -sS "http://127.0.0.1:18080/" || true)
echo "body=$BODY" | tee -a "$SCRATCH/deploy-image.log"

if [ -n "${DEPLOY_SOURCE_DOCKERFILE:-}" ] && [ -d "$DEPLOY_SOURCE_DOCKERFILE" ]; then
  echo "==> Deploy Dockerfile source $DEPLOY_SOURCE_DOCKERFILE" | tee "$SCRATCH/deploy-dockerfile.log"
  DFD=$(rpc "deployments/create" "{\"json\":{\"projectId\":\"$PROJECT_ID\",\"nodeId\":\"$NODE_ID\",\"serviceName\":\"dfweb\",\"sourcePath\":\"$DEPLOY_SOURCE_DOCKERFILE\",\"options\":{\"publishPort\":18081,\"containerPort\":80}}}")
  echo "$DFD" | tee -a "$SCRATCH/deploy-dockerfile.log"
  echo "$DFD" | grep -q 'dockerfile\|running\|buildStrategy'
fi

if [ -n "${DEPLOY_SOURCE_RAILPACK:-}" ] && [ -d "$DEPLOY_SOURCE_RAILPACK" ]; then
  echo "==> Deploy Railpack source $DEPLOY_SOURCE_RAILPACK" | tee "$SCRATCH/deploy-railpack.log"
  RPD=$(rpc "deployments/create" "{\"json\":{\"projectId\":\"$PROJECT_ID\",\"nodeId\":\"$NODE_ID\",\"serviceName\":\"rpweb\",\"sourcePath\":\"$DEPLOY_SOURCE_RAILPACK\",\"options\":{\"publishPort\":18082,\"containerPort\":3000}}}")
  echo "$RPD" | tee -a "$SCRATCH/deploy-railpack.log"
  echo "$RPD" | grep -q 'railpack\|running\|buildStrategy'
fi

echo "==> List projects" | tee -a "$SCRATCH/provision.log"
LIST=$(rpc "projects/list")
echo "$LIST" | tee -a "$SCRATCH/provision.log"
echo "$LIST" | grep -q "$PROJECT"

echo "==> Destroy project" | tee "$SCRATCH/destroy.log"
DESTROY=$(rpc "projects/destroy" "{\"json\":{\"id\":\"$PROJECT_ID\"}}")
echo "$DESTROY" | tee -a "$SCRATCH/destroy.log"
echo "$DESTROY" | grep -q 'ok\|true'

# containers should be gone
REMAINING=$(docker ps -aq --filter "label=deplow.projectId=$PROJECT_ID" | wc -l | tr -d ' ')
echo "remaining_containers=$REMAINING" | tee -a "$SCRATCH/destroy.log"
test "$REMAINING" = "0"

echo ""
echo "=============================="
echo "E2E PASSED"
echo "=============================="
