#!/usr/bin/env bash
# register-connector.sh — runs in the kafka-connect container on first boot.
# Single source of truth: /etc/connect/connector.json (= gdfkube-src/connector.json).
set -euo pipefail

API="${CONNECT_API:-http://localhost:8083}"
PAYLOAD="${CONNECTOR_JSON:-/etc/connect/connector.json}"
NAME="$(jq -r '.name' "$PAYLOAD")"

deadline=$(( $(date +%s) + 60 ))
until curl -fsS "$API/" >/dev/null 2>&1; do
  if [[ $(date +%s) -ge $deadline ]]; then
    echo "register-connector: API at localhost:8083 unreachable after 60s" >&2
    exit 1
  fi
  sleep 2
done

# already registered?
if curl -fsS "$API/connectors/$NAME" >/dev/null 2>&1; then
  echo "register-connector: $NAME already registered"
  exit 0
fi

http_code=$(curl -sS -o /tmp/register-connector.out -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -X POST --data @"$PAYLOAD" "$API/connectors")

case "$http_code" in
  201) echo "register-connector: registered $NAME" ;;
  409) echo "register-connector: $NAME already exists (409)" ;;
  *)   cat /tmp/register-connector.out >&2; exit 1 ;;
esac
