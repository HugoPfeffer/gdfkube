#!/usr/bin/env bash
# Aligns the in-container `docker` group GID with the host docker socket's GID
# so the non-root `node` user can use the bind-mounted socket without sudo.
# Intended to run as root via sudo from a devcontainer postStartCommand.

set -euo pipefail

SOCK="${1:-/var/run/docker.sock}"
TARGET_USER="${2:-node}"

if [ ! -S "$SOCK" ]; then
  echo "setup-docker-group: $SOCK not present — was the host socket bind-mounted?" >&2
  exit 0
fi

HOST_GID="$(stat -c '%g' "$SOCK")"

if getent group docker >/dev/null; then
  CUR_GID="$(getent group docker | cut -d: -f3)"
  if [ "$CUR_GID" != "$HOST_GID" ]; then
    # If another group already owns the target GID, rename it out of the way.
    OWNER="$(getent group "$HOST_GID" | cut -d: -f1 || true)"
    if [ -n "$OWNER" ] && [ "$OWNER" != "docker" ]; then
      groupmod -n "_freed_${OWNER}" "$OWNER"
    fi
    groupmod -g "$HOST_GID" docker
  fi
else
  OWNER="$(getent group "$HOST_GID" | cut -d: -f1 || true)"
  if [ -n "$OWNER" ]; then
    groupmod -n docker "$OWNER"
  else
    groupadd -g "$HOST_GID" docker
  fi
fi

if ! id -nG "$TARGET_USER" | tr ' ' '\n' | grep -qx docker; then
  usermod -aG docker "$TARGET_USER"
fi

echo "setup-docker-group: docker group GID=$HOST_GID, $TARGET_USER is a member"
