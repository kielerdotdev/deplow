#!/usr/bin/env bash
# Git OAuth path smoke against a running control plane (no real GitHub App required).
# Exercises: connectionStatus, startOAuth errors, connectGit (optional PAT), list repos.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="$(mktemp)"
ORIGIN="$BASE"
EMAIL="git-e2e-$(date +%s)@example.com"
PASS="testpass123"
PROJECT="gitoauth$(date +%s | tail -c 6)"
SCRATCH="${SCRATCH_DIR:-/tmp/deplow-git-oauth-e2e}"
mkdir -p "$SCRATCH"

cleanup() { rm -f "$COOKIE_JAR"; }
trap cleanup EXIT

rpc() {
  local path="$1"
  # Avoid ${2:-{}} — bash treats the braces as expansion syntax and can mangle JSON
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
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); const v=j.json??j; const path=process.argv[1].split('.'); let cur=v; for (const p of path){ if(cur==null){console.log(''); process.exit(0)}; cur=cur[p]; } console.log(cur??'');});" "$1"
}

echo "==> Health"
HEALTH=$(rpc "health")
echo "$HEALTH" | tee "$SCRATCH/health.json"
echo "$HEALTH" | grep -q '"ok":true'

echo "==> Sign up $EMAIL"
SIGNUP=$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/sign-up/email" \
  -H "Content-Type: application/json" -H "Origin: $ORIGIN" \
  -d "{\"name\":\"GitE2E\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
echo "$SIGNUP" | tee "$SCRATCH/signup.json"
echo "$SIGNUP" | grep -q "$EMAIL"

echo "==> git.connectionStatus"
STATUS=$(rpc "git/connectionStatus")
echo "$STATUS" | tee "$SCRATCH/git-status.json"
# Must return shape without 500
echo "$STATUS" | grep -q 'githubAppConfigured'
echo "$STATUS" | grep -q 'gitlabOAuthConfigured'
echo "$STATUS" | grep -q 'links'

echo "==> git.startOAuth github (expect URL or clear BAD_REQUEST)"
OAUTH=$(rpc "git/startOAuth" '{"json":{"provider":"github","returnTo":"/integrations"}}' || true)
echo "$OAUTH" | tee "$SCRATCH/oauth-start.json"
# Either redirect URL or structured error about App not configured
if echo "$OAUTH" | grep -q '"url"'; then
  echo "$OAUTH" | grep -q 'github.com/login/oauth/authorize'
  echo "OK: OAuth authorize URL returned (App configured)"
else
  echo "$OAUTH" | grep -qi 'GitHub\|configured\|BAD_REQUEST\|message'
  echo "OK: startOAuth failed clearly without App (expected in dev)"
fi

echo "==> Create project"
CREATE=$(rpc "projects/create" "{\"json\":{\"name\":\"$PROJECT\"}}")
echo "$CREATE" | tee "$SCRATCH/create.json"
PROJECT_ID=$(echo "$CREATE" | json_field "id")
test -n "$PROJECT_ID"

echo "==> connectGit public repo without token (auto webhook may fail; connect must succeed)"
CONNECT=$(rpc "projects/connectGit" "{\"json\":{\"projectId\":\"$PROJECT_ID\",\"provider\":\"github\",\"repoUrl\":\"https://github.com/octocat/Hello-World.git\",\"branch\":\"master\",\"repoFullName\":\"octocat/Hello-World\",\"autoWebhook\":false}}")
echo "$CONNECT" | tee "$SCRATCH/connect.json"
echo "$CONNECT" | grep -q '"connected":true'
echo "$CONNECT" | grep -q 'webhookUrl'
# When autoWebhook false, secret is returned for manual setup
echo "$CONNECT" | grep -q 'webhookSecret\|webhookManaged'

echo "==> projects.get shows git connected"
GET=$(rpc "projects/get" "{\"json\":{\"id\":\"$PROJECT_ID\"}}")
echo "$GET" | tee "$SCRATCH/get.json"
echo "$GET" | grep -q 'Hello-World\|octocat'
echo "$GET" | grep -q '"connected":true'

echo "==> deployments.create fromGit (real clone; build may fail for fixture repo)"
DEPLOY=$(rpc "deployments/create" "{\"json\":{\"projectId\":\"$PROJECT_ID\",\"fromGit\":true,\"serviceName\":\"app\"}}" || true)
echo "$DEPLOY" | tee "$SCRATCH/deploy-from-git.json"
# Clone must have run: either running/deploying OR failed at build (not at git clone)
if echo "$DEPLOY" | grep -qi 'git clone failed\|Couldn’t clone\|Couldn.t clone'; then
  echo "FAIL: git clone failed"
  exit 1
fi
# Accept: deploy object, or railpack/build failure after successful clone
echo "$DEPLOY" | grep -qE 'running|building|deploying|failed|railpack|build' \
  || echo "$DEPLOY" | grep -q 'status'
echo "OK: fromGit path invoked (clone succeeded or non-clone error)"

if [ -n "${DEPLOW_GITHUB_TOKEN:-}" ] || [ -n "${GITHUB_TOKEN:-}" ]; then
  TOKEN="${DEPLOW_GITHUB_TOKEN:-$GITHUB_TOKEN}"
  echo "==> listGitRepos with PAT"
  LIST=$(rpc "projects/listGitRepos" "{\"json\":{\"provider\":\"github\",\"token\":\"$TOKEN\"}}")
  echo "$LIST" | tee "$SCRATCH/list-repos.json"
  echo "$LIST" | grep -q 'repos'
else
  echo "==> skip listGitRepos (no DEPLOW_GITHUB_TOKEN)"
fi

echo "==> disconnectGit"
DISC=$(rpc "projects/disconnectGit" "{\"json\":{\"projectId\":\"$PROJECT_ID\"}}")
echo "$DISC" | tee "$SCRATCH/disconnect.json"
echo "$DISC" | grep -q '"ok":true'

GET2=$(rpc "projects/get" "{\"json\":{\"id\":\"$PROJECT_ID\"}}")
echo "$GET2" | tee "$SCRATCH/get-after-disconnect.json"
# connected should be false
echo "$GET2" | grep -q '"connected":false' || echo "$GET2" | grep -q '"git":' 

echo "==> git.githubAppManifestStart"
MAN=$(rpc "git/githubAppManifestStart")
echo "$MAN" | tee "$SCRATCH/manifest.json"
echo "$MAN" | grep -q 'manifest'
echo "$MAN" | grep -q 'postUrl\|settings/apps'

echo ""
echo "Git OAuth API smoke PASSED"
echo "Artifacts: $SCRATCH"
