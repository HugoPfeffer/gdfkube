#!/usr/bin/env bash
# chart-lint.sh — Phase 0 invariant checks (TSK-005-01-01)
# Traces: REQ-005-01, REQ-001-02, REQ-001-03
set -euo pipefail

ROOT=/workspace/gdfkube-src

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

VIOLATIONS=0

# ── Rule (a) Chart-path containment (G5, REQ-001-02) ─────────────────────────
ALLOWED_PATTERN="^${ROOT}/(gdfkube-infra/charts/|gdfkube-orgs/charts/|gdfkube-orgs/[^/]+/charts/)"
CHART_VIOLATIONS=$(find "${ROOT}" -name Chart.yaml \
  | grep -Ev "${ALLOWED_PATTERN}" || true)

if [[ -n "${CHART_VIOLATIONS}" ]]; then
  echo "[G5] Chart.yaml found outside allowed roots:" >&2
  while IFS= read -r path; do
    echo "  ${path}" >&2
  done <<< "${CHART_VIOLATIONS}"
  VIOLATIONS=$((VIOLATIONS + $(echo "${CHART_VIOLATIONS}" | wc -l)))
else
  echo "chart-path containment: 0 violations"
fi

# ── Rule (b) Canonical label namespace (G3, REQ-001-03) ──────────────────────
LEGACY_PATTERN='gdfkube\.gov/'"grou"'p([^a-zA-Z0-9_-]|$)'
LABEL_VIOLATIONS=$(grep -RIEn --include='*' --exclude-dir=.git \
  "${LEGACY_PATTERN}" "${ROOT}/" || true)

if [[ -n "${LABEL_VIOLATIONS}" ]]; then
  echo "[G3] Legacy label namespace found:" >&2
  echo "${LABEL_VIOLATIONS}" | while IFS= read -r line; do
    echo "  ${line}" >&2
  done
  VIOLATIONS=$((VIOLATIONS + $(echo "${LABEL_VIOLATIONS}" | wc -l)))
else
  echo "canonical label: 0 violations"
fi

# ── Rule (c) No imperative apply invocations (G4) ────────────────────────────
APPLY_VIOLATIONS=$(grep -RIEn \
  --exclude-dir=.git \
  --exclude-dir=tests \
  --exclude-dir=scripts \
  '\b(kubectl|oc)[[:space:]]+apply\b' "${ROOT}/" || true)

if [[ -n "${APPLY_VIOLATIONS}" ]]; then
  echo "[G4] Imperative apply invocations found:" >&2
  echo "${APPLY_VIOLATIONS}" | while IFS= read -r line; do
    echo "  ${line}" >&2
  done
  VIOLATIONS=$((VIOLATIONS + $(echo "${APPLY_VIOLATIONS}" | wc -l)))
else
  echo "no-apply gate: 0 violations"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
if [[ "${VIOLATIONS}" -eq 0 ]]; then
  echo "chart-lint: PASS"
else
  echo "chart-lint: FAIL (${VIOLATIONS} violations)" >&2
  exit 1
fi
