#!/usr/bin/env bash
# G3/G4 PreToolUse guardrail.
# Reads the Claude Code hook payload from stdin, blocks Edit/Write/MultiEdit
# operations that would introduce:
#   G3 — legacy org label (canonical is `gdfkube.gov/org`)
#   G4 — direct cluster apply outside `tests/` and dev-only `scripts/`
# Exit 0 = allow.  Exit 2 = block (stderr is fed back to Claude).
#
# Patterns are assembled from fragments so this script's own source text
# never contains the literal trigger strings.
# Plan docs (.claude/plans/) are exempt — they discuss legacy patterns in
# guardrail definitions; the CI gate scopes to gdfkube-src/.

set -euo pipefail

payload="$(cat)"

tool_name="$(jq -r '.tool_name // empty' <<<"$payload")"
file_path="$(jq -r '.tool_input.file_path // .tool_input.path // empty' <<<"$payload")"

case "$tool_name" in
  Edit|StrReplace)
    new_text="$(jq -r '.tool_input.new_string // empty' <<<"$payload")" ;;
  Write)
    new_text="$(jq -r '.tool_input.content // .tool_input.contents // empty' <<<"$payload")" ;;
  MultiEdit)
    new_text="$(jq -r '[.tool_input.edits[]?.new_string] | join("\n")' <<<"$payload")" ;;
  *)  exit 0 ;;
esac

[[ -z "$new_text" ]] && exit 0

# Plan docs and hook scripts are exempt — they discuss legacy patterns in context.
case "$file_path" in
  .claude/plans/*|.claude/hooks/*|*/.claude/plans/*|*/.claude/hooks/*) exit 0 ;;
esac

# Build trigger patterns from fragments to avoid self-matching.
_legacy_label="gdfkube.gov/gro""up"
_g3_re='gdfkube\.gov/gro'"up"'([^a-zA-Z0-9_-]|$)'

_kctl="kube""ctl"
_oc="oc"
_verb="app""ly"
_g4_re='\b('"${_kctl}"'|'"${_oc}"')[[:space:]]+'"${_verb}"'\b'

# G3 — legacy label
if grep -qE "$_g3_re" <<<"$new_text"; then
  echo "blocked by G3: replace '${_legacy_label}' with 'gdfkube.gov/org' (canonical label, see phase-0-foundation.md §0.3)" >&2
  exit 2
fi

# G4 — direct cluster apply outside tests/ and scripts/
if grep -qE "$_g4_re" <<<"$new_text"; then
  case "$file_path" in
    tests/*|scripts/*|*/tests/*|*/scripts/*|*.test.*|*_test.*)
      : # allow
      ;;
    *)
      echo "blocked by G4: cluster mutations always go through ArgoCD reading Git, not direct ${_kctl}/${_oc} ${_verb} (phase-0-foundation.md §3.6 G4). If this is a test or dev-only script, place it under tests/ or scripts/." >&2
      exit 2
      ;;
  esac
fi

exit 0
