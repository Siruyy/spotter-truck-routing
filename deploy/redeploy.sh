#!/usr/bin/env bash
# Redeploy the Dokploy compose stack (pulls the latest GHCR images).
# Needs DOKPLOY_URL and DOKPLOY_API_KEY in the environment; prints no secrets.
set -euo pipefail
COMPOSE_ID="${COMPOSE_ID:-KETGCgFUm_zoDv6IMyCTq}"
BASE="${DOKPLOY_URL%/}"
[[ "$BASE" == */api ]] || BASE="$BASE/api"
api() { curl -fsS -H "x-api-key: $DOKPLOY_API_KEY" -H "content-type: application/json" "$@"; }
status() { api "$BASE/compose.one?composeId=$COMPOSE_ID" | python3 -I -c "import json,sys;print(json.load(sys.stdin)['composeStatus'])"; }

api -X POST -d "{\"composeId\":\"$COMPOSE_ID\",\"title\":\"${1:-Redeploy}\"}" "$BASE/compose.deploy" >/dev/null
sleep 5
until s=$(status); [[ "$s" == done || "$s" == error ]]; do sleep 5; done
echo "deploy: $s"
for _ in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "https://${PUBLIC_HOST:-truckroute.siruyy.dev}/api/health")
  [[ "$code" == 200 ]] && { echo "health: ok"; exit 0; }
  sleep 6
done
echo "health: $code" >&2
exit 1
