#!/bin/sh
set -eu

: "${SONAR_URL:=http://sonarqube:9000}"
: "${SONAR_ADMIN_PASSWORD:?required}"
: "${SONAR_TOKEN_NAME:=gdfkube-analysis}"
: "${SONAR_PROJECTS:=gdfkube-camel,gdfkube-itsm-web,gdfkube-itsm-server}"
: "${SONAR_GATE_NAME:=gdfkube-gate}"
TOKEN_DIR=/sonar

log() { echo "[sonar-bootstrap] $*"; }
api() {
  _m=$1; _p=$2; shift 2
  curl -s -o /tmp/resp -w '%{http_code}' -u "$AUTH" -X "$_m" "$SONAR_URL$_p" "$@"
}

# 1. Rotate default admin/admin; tolerate already-rotated (idempotent re-run).
AUTH="admin:admin"
ROT=$(api POST "/api/users/change_password" \
  --data-urlencode "login=admin" \
  --data-urlencode "previousPassword=admin" \
  --data-urlencode "password=$SONAR_ADMIN_PASSWORD" || echo 000)
if [ "$ROT" = "204" ] || [ "$ROT" = "200" ]; then
  log "admin password rotated"
  AUTH="admin:$SONAR_ADMIN_PASSWORD"
else
  AUTH="admin:$SONAR_ADMIN_PASSWORD"
  CHK=$(api GET "/api/authentication/validate" || echo 000)
  if ! grep -q '"valid":true' /tmp/resp 2>/dev/null; then
    log "FATAL: neither default nor rotated admin credentials are valid (http=$ROT/$CHK)" >&2
    exit 1
  fi
  log "admin password already rotated (idempotent)"
fi

# 2. Create projects (tolerate "already exists" -> 400).
OLD_IFS=$IFS; IFS=,
for KEY in $SONAR_PROJECTS; do
  IFS=$OLD_IFS
  C=$(api POST "/api/projects/create" \
    --data-urlencode "project=$KEY" --data-urlencode "name=$KEY" || echo 000)
  [ "$C" = "200" ] && log "project created: $KEY" || log "project $KEY exists/skip (http=$C)"
  IFS=,
done
IFS=$OLD_IFS

# 3. Quality gate on New Code; set default; bind all projects.
api POST "/api/qualitygates/create" --data-urlencode "name=$SONAR_GATE_NAME" >/dev/null || true
addcond() {
  api POST "/api/qualitygates/create_condition" \
    --data-urlencode "gateName=$SONAR_GATE_NAME" \
    --data-urlencode "metric=$1" --data-urlencode "op=$2" \
    --data-urlencode "error=$3" >/dev/null || true
}
addcond new_coverage LT 80
addcond new_duplicated_lines_density GT 3
addcond new_maintainability_rating GT 1
addcond new_reliability_rating GT 1
addcond new_security_rating GT 1
addcond new_blocker_violations GT 0
addcond new_critical_violations GT 0
api POST "/api/qualitygates/set_as_default" \
  --data-urlencode "name=$SONAR_GATE_NAME" >/dev/null || true
OLD_IFS=$IFS; IFS=,
for KEY in $SONAR_PROJECTS; do
  IFS=$OLD_IFS
  api POST "/api/qualitygates/select" \
    --data-urlencode "gateName=$SONAR_GATE_NAME" \
    --data-urlencode "projectKey=$KEY" >/dev/null || true
  IFS=,
done
IFS=$OLD_IFS

# 4. Mint a fresh global analysis token into the sonar-init volume.
mkdir -p "$TOKEN_DIR"
api POST "/api/user_tokens/generate" \
  --data-urlencode "name=${SONAR_TOKEN_NAME}-$(date +%s)" \
  --data-urlencode "type=GLOBAL_ANALYSIS_TOKEN" >/dev/null
TOKEN=$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' /tmp/resp)
if [ -z "$TOKEN" ]; then
  log "FATAL: token generation returned empty token" >&2
  exit 1
fi
printf '%s' "$TOKEN" > "$TOKEN_DIR/token"
chmod 600 "$TOKEN_DIR/token"
printf '%s' "$SONAR_URL" > "$TOKEN_DIR/url"
unset TOKEN
log "done: projects=$SONAR_PROJECTS gate=$SONAR_GATE_NAME url=$SONAR_URL"
