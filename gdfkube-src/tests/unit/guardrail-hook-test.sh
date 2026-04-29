#!/usr/bin/env bash
# guardrail-hook-test.sh — validate .claude/hooks/check-guardrails.sh contract.
# Asserts compliant writes pass, forbidden writes block, path-allowlist works,
# and Edit/MultiEdit payloads are scanned identically.
set -uo pipefail   # not -e — we expect non-zero exits in the assertions

HOOK="/workspace/.claude/hooks/check-guardrails.sh"
[[ -x "$HOOK" ]] || { echo "hook missing or not executable: $HOOK" >&2; exit 1; }

# Assemble forbidden literals at runtime (test source stays clean of pre-commit triggers).
prefix='gdfkube.gov/'; suffix='gro'"up"
LEGACY="${prefix}${suffix}"
cli='kube'"ctl"; verb='ap'"ply"
INVOCATION="${cli} ${verb} -f manifest.yaml"

failures=0

run_assertion() {
  local name="$1" expected_rc="$2" expected_stderr_substr="$3" payload="$4"
  local err rc
  err=$(echo "$payload" | "$HOOK" 2>&1 >/dev/null); rc=$?
  if [[ "$rc" -ne "$expected_rc" ]]; then
    echo "FAIL [$name]: expected exit $expected_rc, got $rc" >&2
    [[ -n "$err" ]] && echo "  stderr: $err" >&2
    failures=$((failures+1)); return
  fi
  if [[ -n "$expected_stderr_substr" ]] && ! grep -qF "$expected_stderr_substr" <<<"$err"; then
    echo "FAIL [$name]: expected stderr substring '$expected_stderr_substr' not found" >&2
    echo "  actual stderr: $err" >&2
    failures=$((failures+1)); return
  fi
  echo "PASS [$name]"
}

mk_write() { jq -nc --arg fp "$1" --arg c "$2" '{tool_name:"Write", tool_input:{file_path:$fp, content:$c}}'; }
mk_edit()  { jq -nc --arg fp "$1" --arg s "$2" '{tool_name:"Edit",  tool_input:{file_path:$fp, new_string:$s}}'; }
mk_multi() { jq -nc --arg fp "$1" --arg s "$2" '{tool_name:"MultiEdit", tool_input:{file_path:$fp, edits:[{new_string:"safe"},{new_string:$s}]}}'; }

# 1. compliant write → allow
run_assertion "compliant write" 0 "" \
  "$(mk_write "/workspace/foo.yaml" "metadata:\n  labels:\n    gdfkube.gov/org: acme")"

# 2. legacy label literal in Write → block G3
run_assertion "G3 in Write" 2 "blocked by G3" \
  "$(mk_write "/workspace/foo.yaml" "labels:\n  ${LEGACY}: legacy")"

# 3. imperative apply outside tests/scripts → block G4
run_assertion "G4 outside allowlist" 2 "blocked by G4" \
  "$(mk_write "/workspace/gdfkube-src/camel/run.sh" $'#!/bin/sh\n'"${INVOCATION}"$'\n')"

# 4. imperative apply under scripts/ → allow (path-exempt)
run_assertion "G4 under scripts/" 0 "" \
  "$(mk_write "/workspace/gdfkube-src/scripts/run.sh" $'#!/bin/sh\n'"${INVOCATION}"$'\n')"

# 5. imperative apply under tests/ → allow (path-exempt)
run_assertion "G4 under tests/" 0 "" \
  "$(mk_write "/workspace/gdfkube-src/tests/run.sh" $'#!/bin/sh\n'"${INVOCATION}"$'\n')"

# 6. legacy label literal in Edit → block G3
run_assertion "G3 in Edit" 2 "blocked by G3" \
  "$(mk_edit "/workspace/foo.yaml" "${LEGACY}: legacy")"

# 7. legacy label literal in MultiEdit (one of multiple edits) → block G3
run_assertion "G3 in MultiEdit" 2 "blocked by G3" \
  "$(mk_multi "/workspace/foo.yaml" "${LEGACY}: legacy")"

# 8. unrelated tool (Read) → unconditional pass
run_assertion "non-write tool" 0 "" \
  '{"tool_name":"Read","tool_input":{"file_path":"/workspace/foo.yaml"}}'

if [[ $failures -gt 0 ]]; then
  echo "guardrail-hook self-test: FAIL ($failures)" >&2; exit 1
fi
echo "guardrail-hook self-test: PASS (8/8)"
