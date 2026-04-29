#!/usr/bin/env bash
# G3/G4 PreToolUse guardrail.
# Reads the Claude Code hook payload from stdin, blocks Edit/Write/MultiEdit
# operations that would introduce:
#   G3 — `gdfkube.gov/group` (legacy label; canonical is `gdfkube.gov/org`)
#   G4 — `kubectl apply` / `oc apply` outside `tests/` and dev-only `scripts/`
# Exit 0 = allow.  Exit 2 = block (stderr is fed back to Claude).

set -euo pipefail

payload="$(cat)"

tool_name="$(jq -r '.tool_name // empty' <<<"$payload")"
file_path="$(jq -r '.tool_input.file_path // empty' <<<"$payload")"

case "$tool_name" in
  Edit)       new_text="$(jq -r '.tool_input.new_string // empty' <<<"$payload")" ;;
  Write)      new_text="$(jq -r '.tool_input.content   // empty' <<<"$payload")" ;;
  MultiEdit)  new_text="$(jq -r '[.tool_input.edits[]?.new_string] | join("\n")' <<<"$payload")" ;;
  *)          exit 0 ;;
esac

[[ -z "$new_text" ]] && exit 0

# G3 — legacy label
if grep -qE 'gdfkube\.gov/group([^a-zA-Z0-9_-]|$)' <<<"$new_text"; then
  echo "blocked by G3: replace 'gdfkube.gov/group' with 'gdfkube.gov/org' (canonical label, see phase-0-foundation.md §0.3)" >&2
  exit 2
fi

# G4 — kubectl/oc apply outside tests/ and scripts/
if grep -qE '\b(kubectl|oc)[[:space:]]+apply\b' <<<"$new_text"; then
  case "$file_path" in
    */tests/*|*/scripts/*|*.test.*|*_test.*)
      : # allow
      ;;
    *)
      echo "blocked by G4: cluster mutations always go through ArgoCD reading Git, not kubectl/oc apply (phase-0-foundation.md §3.6 G4). If this is a test or dev-only script, place it under tests/ or scripts/." >&2
      exit 2
      ;;
  esac
fi

exit 0
