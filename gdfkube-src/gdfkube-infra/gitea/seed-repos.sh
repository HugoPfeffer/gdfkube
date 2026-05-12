#!/bin/sh
set -eu

: "${GITEA_ADMIN_USERNAME:?required}"
: "${GITEA_ORG:?required}"
: "${GITEA_REPO_MAIN:?required}"

TOKEN=$(cat /data/itsm/token)
[ -n "$TOKEN" ] || { echo "[gitea-repo-seed] empty token file" >&2; exit 1; }

STATUS=$(curl -sf -o /dev/null -w "%{http_code}" \
    -H "Authorization: token $TOKEN" \
    -X POST "http://gitea:3000/api/v1/orgs/$GITEA_ORG/repos" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$GITEA_REPO_MAIN\",\"auto_init\":false,\"default_branch\":\"main\"}" \
    || true)
case "$STATUS" in
    201|409) ;;
    *) echo "[gitea-repo-seed] repo create failed with status=$STATUS" >&2; exit 1 ;;
esac

WORK=$(mktemp -d)
cp -a /workspace-src/. "$WORK/"

find "$WORK" \( \
      -name node_modules -o \
      -name target -o \
      -name dist -o \
      -name build -o \
      -name .git -o \
      -name .DS_Store -o \
      -name '*.pem' -o \
      -name '*.key' \
    \) -prune -exec rm -rf {} +

find "$WORK" \( -name '.env' -o -name '.env.*' \) -type f -delete

cat > "$WORK/.gitignore" <<'GITIGNORE'
node_modules/
target/
dist/
build/
.git/
.DS_Store
.env
.env.*
*.pem
*.key
GITIGNORE

cd "$WORK"
git config --global --add safe.directory "$WORK"
git init -q -b main
git config user.email "bootstrap@gdfkube.local"
git config user.name "gitea-bootstrap"
git add -A
git commit -q -m "Initial bootstrap from workspace ($(date -u +%FT%TZ))"
SHA=$(git rev-parse --short HEAD)

REMOTE="http://${GITEA_ADMIN_USERNAME}:${TOKEN}@gitea:3000/${GITEA_ORG}/${GITEA_REPO_MAIN}.git"
git push -q --force "$REMOTE" main

cd /
rm -rf "$WORK"
echo "[gitea-repo-seed] repo=$GITEA_ORG/$GITEA_REPO_MAIN commit=$SHA"
