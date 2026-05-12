#!/bin/sh
set -eu

: "${GITEA_ORG:?required}"

GITEA_LOCAL_TOKEN=$(cat /data/itsm/token)
[ -n "$GITEA_LOCAL_TOKEN" ] || { echo "[gitea-token-sync] empty token file" >&2; exit 1; }
export GITEA_LOCAL_TOKEN

mongosh --quiet "mongodb://mongo1:27017/gdfkube?replicaSet=rs0&serverSelectionTimeoutMS=10000" --eval '
  db.gitea_settings.updateOne(
    { _id: "gitea" },
    { $set: {
        endpoint: "http://gitea:3000",
        owner: process.env.GITEA_ORG,
        token: process.env.GITEA_LOCAL_TOKEN,
        updatedBy: "gitea-init",
        updatedAt: new Date()
      } },
    { upsert: true }
  );
'

unset GITEA_LOCAL_TOKEN
echo "[gitea-token-sync] gitea_settings upserted (owner=$GITEA_ORG)"
