#!/usr/bin/env bash
# PostToolUse: when a Score spec is edited, regenerate compose.yaml + Helm
# release output so the working tree stays in sync with the spec. This hook
# never blocks — it always exits 0, even on regen failure (CI is the gate).

set -uo pipefail

payload="$(cat)"
file_path="$(jq -r '.tool_input.file_path // empty' <<<"$payload")"

case "$file_path" in
  */gdfkube-src/score.*.yaml|*/gdfkube-src/score-compose.yaml)
    if [[ -f /workspace/gdfkube-src/Taskfile.yaml ]]; then
      (cd /workspace/gdfkube-src && task score:gen) >&2 || \
        echo "[regen-on-score-edit] task score:gen failed; please run it manually before committing." >&2
    fi
    ;;
esac

exit 0
