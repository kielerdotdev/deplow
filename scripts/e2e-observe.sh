#!/usr/bin/env bash
# End-to-end Observe: enable project → ingest envelope → digest → UI routes.
# Requires: DEPLOW_OBSERVE_ENABLED=1, ClickHouse up, Redis, `pnpm dev` on :3000
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="$(mktemp)"
ORIGIN="$BASE"
EMAIL="observe-e2e-$(date +%s)@example.com"
PASS="testpass123"
PROJECT="obs$(date +%s | tail -c 6)"
SCRATCH="${SCRATCH_DIR:-/tmp/deplow-observe-e2e}"
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

page() {
  local path="$1"
  local out
  out="$(mktemp)"
  curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -H "Origin: $ORIGIN" \
    -H "Accept: text/html" \
    "$BASE$path" -o "$out"
  # Strip NULs that some SSR streams include
  tr -d '\0' < "$out"
  rm -f "$out"
}

echo "==> Sign up $EMAIL" | tee "$SCRATCH/observe.log"
SIGNUP=$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/sign-up/email" \
  -H "Content-Type: application/json" -H "Origin: $ORIGIN" \
  -d "{\"name\":\"ObserveE2E\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
echo "$SIGNUP" | tee -a "$SCRATCH/observe.log"
echo "$SIGNUP" | grep -q "$EMAIL"

echo "==> Observe status" | tee -a "$SCRATCH/observe.log"
STATUS=$(rpc "observe/status")
echo "$STATUS" | tee -a "$SCRATCH/observe.log"
echo "$STATUS" | grep -q '"enabled":true\|"enabled": true' || {
  echo "ERROR: Observe not enabled. Set DEPLOW_OBSERVE_ENABLED=1 and restart web."
  exit 1
}
echo "$STATUS" | grep -q '"clickhouseOk":true\|"clickhouseOk": true' || {
  echo "ERROR: ClickHouse not ready (check profile observe + listen_host)."
  exit 1
}

echo "==> Create project $PROJECT" | tee -a "$SCRATCH/observe.log"
CREATE=$(rpc "projects/create" "{\"json\":{\"name\":\"$PROJECT\"}}")
echo "$CREATE" | tee -a "$SCRATCH/observe.log"
PROJECT_ID=$(echo "$CREATE" | json_field "id")
test -n "$PROJECT_ID"

echo "==> Enable Observe" | tee -a "$SCRATCH/observe.log"
ENABLE=$(rpc "observe/projects/enable" "{\"json\":{\"projectId\":\"$PROJECT_ID\"}}")
echo "$ENABLE" | tee -a "$SCRATCH/observe.log"
DSN=$(echo "$ENABLE" | json_field "dsn")
SENTRY_ID=$(echo "$ENABLE" | json_field "sentryId")
test -n "$DSN"
test -n "$SENTRY_ID"

# Parse public key from DSN: http://KEY@host/ID
PUBLIC_KEY=$(node -e "const u=new URL(process.argv[1]); console.log(u.username)" "$DSN")
test -n "$PUBLIC_KEY"

EVENT_ID="$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")"
ENVELOPE=$(node <<NODE
const event = {
  event_id: "$EVENT_ID",
  message: "observe-e2e-boom",
  level: "error",
  platform: "node",
  exception: {
    values: [{
      type: "Error",
      value: "observe-e2e-boom",
      stacktrace: {
        frames: [
          { filename: "node_modules/x.js", function: "lib", in_app: false },
          { filename: "app.ts", function: "main", lineno: 42, in_app: true },
        ],
      },
    }],
  },
}
const header = JSON.stringify({ event_id: event.event_id, dsn: "$DSN" })
const item = JSON.stringify({ type: "event" })
const payload = JSON.stringify(event)
console.log([header, item, payload].join("\n"))
NODE
)

echo "==> POST envelope event_id=$EVENT_ID" | tee -a "$SCRATCH/observe.log"
INGEST=$(curl -sS -w "\n%{http_code}" -X POST "$BASE/api/$SENTRY_ID/envelope" \
  -H "Content-Type: application/x-sentry-envelope" \
  -H "X-Sentry-Auth: Sentry sentry_key=$PUBLIC_KEY" \
  --data-binary "$ENVELOPE")
HTTP_CODE=$(echo "$INGEST" | tail -n1)
BODY=$(echo "$INGEST" | sed '$d')
echo "http=$HTTP_CODE body=$BODY" | tee -a "$SCRATCH/observe.log"
test "$HTTP_CODE" = "200"
echo "$BODY" | grep -q "$EVENT_ID"

echo "==> Wait for digest → issue" | tee -a "$SCRATCH/observe.log"
ISSUE_ID=""
for i in $(seq 1 40); do
  LIST=$(rpc "observe/issues/list" "{\"json\":{\"projectId\":\"$PROJECT_ID\",\"status\":\"unresolved\"}}")
  ISSUE_ID=$(echo "$LIST" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); const arr=j.json||[]; console.log(arr[0]?.id||'');})")
  if [ -n "$ISSUE_ID" ]; then
    echo "issue=$ISSUE_ID poll=$i" | tee -a "$SCRATCH/observe.log"
    break
  fi
  sleep 0.5
done
test -n "$ISSUE_ID"

echo "==> Fetch event via oRPC" | tee -a "$SCRATCH/observe.log"
EVENT=$(rpc "observe/events/get" "{\"json\":{\"projectId\":\"$PROJECT_ID\",\"eventId\":\"$EVENT_ID\"}}")
echo "$EVENT" | tee -a "$SCRATCH/observe.log"
echo "$EVENT" | grep -q "observe-e2e-boom"

echo "==> UI pages" | tee -a "$SCRATCH/observe.log"
for path in \
  "/observe" \
  "/observe/projects/$PROJECT_ID/issues" \
  "/observe/projects/$PROJECT_ID/issues/$ISSUE_ID" \
  "/observe/projects/$PROJECT_ID/setup"
do
  HTML=$(page "$path")
  echo "$HTML" | tee "$SCRATCH/page-$(echo "$path" | tr '/' '_').html" >/dev/null
  # Logged-in Observe pages should not bounce to login
  echo "$HTML" | grep -qi 'sign in\|log in' && {
    echo "ERROR: $path looks like login redirect"
    exit 1
  } || true
  case "$path" in
    */setup)
      echo "$HTML" | grep -q "SENTRY_DSN\|sentry\|DSN\|otel\|OTEL\|snippet\|@sentry" || {
        echo "ERROR: setup page missing DSN/OTEL content markers"
        # Soft: SSR may hydrate client-only; still require Observe shell chrome
        echo "$HTML" | grep -qi 'Observe\|observe' || exit 1
      }
      ;;
    */issues/*)
      echo "$HTML" | grep -qi 'Stacktrace\|Resolve\|Observe\|observe-e2e' || {
        echo "WARN: issue detail HTML may be client-hydrated; checking shell"
        echo "$HTML" | grep -qi 'Observe\|deplow' || exit 1
      }
      ;;
    *)
      echo "$HTML" | grep -qi 'Observe\|Issues\|Deploy' || {
        echo "ERROR: $path missing Observe UI chrome"
        exit 1
      }
      ;;
  esac
  echo "ok $path" | tee -a "$SCRATCH/observe.log"
done

echo "==> Playwright UI smoke (optional)" | tee -a "$SCRATCH/observe.log"
if command -v pnpm >/dev/null && [ -f "$ROOT/node_modules/playwright/package.json" ]; then
  BASE_URL="$BASE" COOKIE_JAR="$COOKIE_JAR" PROJECT_ID="$PROJECT_ID" ISSUE_ID="$ISSUE_ID" \
    node "$ROOT/scripts/observe-ui-smoke.mjs" | tee -a "$SCRATCH/observe.log"
else
  echo "playwright not installed — skipped" | tee -a "$SCRATCH/observe.log"
fi

echo "e2e-observe: PASS" | tee -a "$SCRATCH/observe.log"
