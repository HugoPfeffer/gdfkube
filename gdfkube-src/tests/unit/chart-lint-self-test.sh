#!/usr/bin/env bash
# chart-lint-self-test.sh — exercise each chart-lint rule against fixture violations.
# Each fixture seeds ONE violation; chart-lint.sh must exit non-zero with the matching G* citation.
# Without this test, a vacuous-pass PR (no charts) could hide a regression in the gate.
set -euo pipefail

CHART_LINT="/workspace/gdfkube-src/scripts/chart-lint.sh"
[[ -x "$CHART_LINT" ]] || { echo "self-test: chart-lint.sh missing or not executable" >&2; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

failures=0
assert_block() {
  local name="$1" guard="$2" root="$3"
  local out err rc=0
  set +e
  err=$("$CHART_LINT" --root "$root" 2>&1 >/dev/null); rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    echo "FAIL [$name]: chart-lint exited 0 against fixture, expected non-zero" >&2
    failures=$((failures+1)); return
  fi
  if ! grep -q "\[$guard\]" <<<"$err"; then
    echo "FAIL [$name]: stderr did not cite $guard. stderr was:" >&2
    echo "$err" >&2
    failures=$((failures+1)); return
  fi
  echo "PASS [$name]: blocked with $guard citation"
}

assert_pass() {
  local name="$1" root="$2"
  if "$CHART_LINT" --root "$root" >/dev/null 2>&1; then
    echo "PASS [$name]: clean fixture exits 0"
  else
    echo "FAIL [$name]: clean fixture should pass" >&2
    failures=$((failures+1))
  fi
}

# --- Fixture 1: Chart.yaml outside any allowed root → G5 ---
F1="$TMP/fix-G5"; mkdir -p "$F1/camel"
echo "apiVersion: v2" > "$F1/camel/Chart.yaml"
assert_block "G5 chart outside allowed roots" G5 "$F1"

# --- Fixture 2: legacy v1 group-label literal under the root → G3 ---
F2="$TMP/fix-G3"; mkdir -p "$F2/some/path"
# Build the forbidden literal at runtime so this test source itself stays clean.
prefix='gdfkube.gov/'
suffix='gro'"up"
printf 'metadata:\n  labels:\n    %s%s: legacy\n' "$prefix" "$suffix" > "$F2/some/path/manifest.yaml"
assert_block "G3 legacy label literal" G3 "$F2"

# --- Fixture 3: imperative apply against kubectl/oc outside tests/ and scripts/ → G4 ---
F3="$TMP/fix-G4"; mkdir -p "$F3/camel"
# Assemble the forbidden invocation at runtime.
verb='ap'"ply"
cli='kube'"ctl"
cat > "$F3/camel/run.sh" <<EOF
#!/usr/bin/env bash
$cli $verb -f manifest.yaml
EOF
assert_block "G4 imperative cluster apply" G4 "$F3"

# --- Fixture 4: clean tree → 0 violations ---
F4="$TMP/fix-clean"; mkdir -p "$F4/gdfkube-infra/charts/example"
echo "apiVersion: v2" > "$F4/gdfkube-infra/charts/example/Chart.yaml"
echo "metadata:\n  labels:\n    gdfkube.gov/org: acme" > "$F4/clean.yaml"
assert_pass "clean fixture" "$F4"

if [[ $failures -gt 0 ]]; then
  echo "chart-lint self-test: FAIL ($failures)" >&2; exit 1
fi
echo "chart-lint self-test: PASS (4/4)"
