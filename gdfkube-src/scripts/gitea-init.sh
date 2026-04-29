#!/bin/bash
# DEV-ONLY: Mirrors the cluster-side Secret shape (key GITEA_TOKEN). In OpenShift, agnosticd provides this; the consumer reads process.env.GITEA_TOKEN identically.
# TSK-003-04-01, traces REQ-003-04
set -euo pipefail

GITEA_URL="${GITEA_URL:-http://gitea:3000}"
ADMIN_USER="admin"
ADMIN_PASS="admin-pass"
ADMIN_EMAIL="admin@gdfkube.local"
TOKEN_NAME="gdfkube-bot"
TOKEN_FILE="/var/lib/gitea/data/admin-token"
API_TIMEOUT=60
BACKOFF=2

# Parse hostname from GITEA_URL
host=$(echo "$GITEA_URL" | sed -E 's|^https?://([^:/]+).*|\1|')

# SCN-003-04-02: Refuse non-local targets
if [[ "$host" != "gitea" && "$host" != "localhost" && "$host" != "127.0.0.1" ]]; then
  echo "gitea-init: refuses non-local target: $host" >&2
  exit 1
fi

# Wait for API reachability
echo "Waiting for Gitea API at $GITEA_URL..."
elapsed=0
while ! curl -sf "$GITEA_URL/api/v1/version" > /dev/null 2>&1; do
  if (( elapsed >= API_TIMEOUT )); then
    echo "gitea-init: API at $GITEA_URL unreachable after ${API_TIMEOUT}s" >&2
    exit 1
  fi
  sleep "$BACKOFF"
  elapsed=$((elapsed + BACKOFF))
done
echo "API is reachable."

# Create admin user (idempotent)
echo "Creating admin user..."
if gitea admin user create --admin --username "$ADMIN_USER" --password "$ADMIN_PASS" --email "$ADMIN_EMAIL" --must-change-password=false 2>&1 | grep -q "user already exists"; then
  echo "Admin user already exists."
else
  echo "Admin user created."
fi

# Generate or regenerate access token
echo "Generating access token..."
token=$(gitea admin user generate-access-token --username "$ADMIN_USER" --token-name "$TOKEN_NAME" --scopes "write:repository,write:user" 2>&1)
# Extract token from output if it contains "Access token was successfully created"
if echo "$token" | grep -q "Access token"; then
  token=$(echo "$token" | grep -oP '(?<=Access token: )\S+' || echo "$token")
fi
echo "$token" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"
echo "Token saved to $TOKEN_FILE"

# Create repository (idempotent, tolerate 409)
echo "Creating repository admin/gdfkube-src..."
http_code=$(curl -s -w "%{http_code}" -o /tmp/repo_response.json \
  -X POST "$GITEA_URL/api/v1/admin/users/$ADMIN_USER/repos" \
  -H "Authorization: token $token" \
  -H "Content-Type: application/json" \
  -d '{"name":"gdfkube-src","auto_init":true,"private":false}')

if [[ "$http_code" == "201" ]]; then
  echo "Repository created."
elif [[ "$http_code" == "409" ]]; then
  echo "Repository already exists."
else
  echo "Failed to create repository. HTTP $http_code" >&2
  cat /tmp/repo_response.json >&2
  exit 1
fi

echo "gitea-init completed successfully."
