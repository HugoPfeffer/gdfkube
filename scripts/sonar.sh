#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-all}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_PROJECT=$(docker compose config --format json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('name',''))" 2>/dev/null || true)
NET="${COMPOSE_PROJECT:+${COMPOSE_PROJECT}_}gdfkube-net"

host_path() {
  local bind_src
  bind_src=$(docker inspect gdfkube-sonar-bootstrap --format '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}}{{end}}{{end}}' 2>/dev/null)
  echo "${bind_src%/gdfkube-src/gdfkube-infra/sonarqube/bootstrap.sh}"
}

read_token() {
  docker compose run --rm -T -v "${COMPOSE_PROJECT:+${COMPOSE_PROJECT}_}sonar-init:/s:ro" \
    --entrypoint sh sonar-bootstrap -c 'cat /s/token'
}

scan_camel() {
  echo "[sonar] camel"
  ( cd gdfkube-src/gdfkube-camel \
    && ./mvnw -B -DskipITs=false -Psonar verify sonar:sonar \
         -Dsonar.token="$(read_token)" )
}

scan_node() {
  local d=$1
  local hroot
  hroot=$(host_path)
  echo "[sonar] $d"
  ( cd "gdfkube-src/$d" && npm run sonar )
  docker run --rm \
    -v "$hroot/gdfkube-src/$d:/usr/src" \
    -e SONAR_HOST_URL="http://sonarqube:9000" \
    -e SONAR_TOKEN="$(read_token)" \
    -w /usr/src \
    --network "$NET" \
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
