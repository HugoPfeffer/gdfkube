#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-all}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

read_token() {
  docker compose run --rm -T -v sonar-init:/s:ro --entrypoint sh sonar-bootstrap \
    -c 'cat /s/token'
}

scan_camel() {
  echo "[sonar] camel"
  ( cd gdfkube-src/gdfkube-camel \
    && ./mvnw -B -DskipITs=false -Psonar verify sonar:sonar \
         -Dsonar.token="$(read_token)" )
}

scan_node() {
  d=$1
  echo "[sonar] $d"
  ( cd "gdfkube-src/$d" && npm run sonar )
  docker compose run --rm -T \
    -v "${COMPOSE_HOST_WORKSPACE:-$ROOT}/gdfkube-src/$d:/usr/src" \
    -e SONAR_HOST_URL="http://sonarqube:9000" \
    -e SONAR_TOKEN="$(read_token)" \
    --entrypoint sonar-scanner \
    -w /usr/src \
    --network gdfkube-net \
    sonarsource/sonar-scanner-cli:11.1
}

rc=0
fail() { echo "[sonar] GATE FAILED: $1" >&2; rc=1; }

case "$TARGET" in
  camel)  scan_camel            || fail camel ;;
  web)    scan_node gdfkube-itsm        || fail web ;;
  server) scan_node gdfkube-itsm/server || fail server ;;
  all)
    scan_camel                    || fail camel
    scan_node gdfkube-itsm        || fail web
    scan_node gdfkube-itsm/server || fail server
    ;;
  *) echo "usage: scripts/sonar.sh camel|web|server|all" >&2; exit 2 ;;
esac

[ "$rc" -eq 0 ] && echo "[sonar] all gates passed" || echo "[sonar] one or more gates failed"
exit "$rc"
