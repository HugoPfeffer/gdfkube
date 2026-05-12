#!/bin/sh
set -eu

: "${GITEA_ADMIN_USERNAME:?required}"
: "${GITEA_ADMIN_PASSWORD:?required}"
: "${GITEA_ADMIN_EMAIL:?required}"
: "${GITEA_TOKEN_NAME:?required}"
: "${GITEA_ORG:?required}"

mkdir -p /data/itsm

su git -c "gitea admin user create \
    --username \"$GITEA_ADMIN_USERNAME\" \
    --password \"$GITEA_ADMIN_PASSWORD\" \
    --email \"$GITEA_ADMIN_EMAIL\" \
    --admin --must-change-password=false" || true

TOKEN=$(su git -c "gitea admin user generate-access-token \
    --username \"$GITEA_ADMIN_USERNAME\" \
    --token-name \"${GITEA_TOKEN_NAME}-$(date +%s)\" \
    --scopes all --raw")

printf '%s' "$TOKEN" > /data/itsm/token
chmod 600 /data/itsm/token

STATUS=$(curl -sf -o /dev/null -w "%{http_code}" \
    -u "$GITEA_ADMIN_USERNAME:$GITEA_ADMIN_PASSWORD" \
    -X POST http://gitea:3000/api/v1/orgs \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$GITEA_ORG\",\"visibility\":\"public\"}" \
    || true)
case "$STATUS" in
    201|422) ;;
    *) echo "[gitea-bootstrap] org create failed with status=$STATUS" >&2; exit 1 ;;
esac

echo "[gitea-bootstrap] user=$GITEA_ADMIN_USERNAME org=$GITEA_ORG token-bytes=$(wc -c < /data/itsm/token)"
unset TOKEN
