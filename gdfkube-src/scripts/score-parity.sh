#!/usr/bin/env bash
# score-parity.sh — Guardrail G1 (§3.6 phase plan)
# TSK-005-02-01 | traces: REQ-005-02, REQ-002-03
#
# Enforce that every env var in score-compose / score-helm output traces back
# to a Score variables: or ${resources.*} reference. Diffs env-var sets and
# port lists between both surfaces; exits non-zero on drift.
#
# Usage: score-parity.sh [--print] [--compose <file>] [--helm <dir>]
# Exit: 0=parity 1=drift 2=tooling/setup error

set -euo pipefail

PRINT_MODE=0
COMPOSE_FILE=""
HELM_DIR=""
SCORE_FILES=(/workspace/gdfkube-src/score.node.yaml /workspace/gdfkube-src/score.camel.yaml)
SCORE_COMPOSE_OVERLAY=/workspace/gdfkube-src/score-compose.yaml

TMP_COMPOSE=/tmp/score-parity-compose.yaml
TMP_HELM=/tmp/score-parity-helm

# ── argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --print) PRINT_MODE=1; shift ;;
    --compose) COMPOSE_FILE="$2"; shift 2 ;;
    --helm)    HELM_DIR="$2";    shift 2 ;;
    *) echo "score-parity: unknown option: $1" >&2; exit 2 ;;
  esac
done

# ── helpers ───────────────────────────────────────────────────────────────────
have() { command -v "$1" &>/dev/null; }

die_setup() { echo "score-parity: $*" >&2; exit 2; }

# ── generate or locate compose output ────────────────────────────────────────
# score-compose 0.22+ workspace: use the existing .score-compose/ if present (set up by
# `task score:gen`), else init it with our provisioners file. score-compose.yaml is a
# provisioners file in 0.22+, NOT an overrides file.
SCORE_COMPOSE_DIR=/workspace/gdfkube-src/.score-compose
if [[ -n "$COMPOSE_FILE" ]]; then
  [[ -f "$COMPOSE_FILE" ]] || die_setup "compose file not found: $COMPOSE_FILE"
  EFFECTIVE_COMPOSE="$COMPOSE_FILE"
elif have score-compose; then
  pushd /workspace/gdfkube-src >/dev/null
  if [[ ! -d .score-compose ]]; then
    if [[ -f "$SCORE_COMPOSE_OVERLAY" ]]; then
      score-compose init --no-sample --provisioners "file://$SCORE_COMPOSE_OVERLAY" --quiet \
        || die_setup "score-compose init failed"
    else
      score-compose init --no-sample --quiet || die_setup "score-compose init failed"
    fi
  fi
  score-compose generate "${SCORE_FILES[@]}" -o "$TMP_COMPOSE" >/dev/null 2>&1 \
    || die_setup "score-compose generate failed"
  popd >/dev/null
  EFFECTIVE_COMPOSE="$TMP_COMPOSE"
else
  CHECKED_IN=/workspace/gdfkube-src/compose.yaml
  if [[ -f "$CHECKED_IN" ]]; then
    EFFECTIVE_COMPOSE="$CHECKED_IN"
  else
    die_setup "score-compose CLI missing and no checked-in compose.yaml found"
  fi
fi

# ── generate or locate helm output ───────────────────────────────────────────
# Phase 0: score-helm has no provisioners for our resource types (mongodb/kafka/gitea);
# Phase 2 lands them with the umbrella chart. Until then, treat helm-side as best-effort:
# if generation fails, fall back to comparing against the empty set (compose-only env vars
# are "stray" relative to a non-existent helm surface and will be reported, but score-parity
# returns drift status truthfully rather than dying with setup error).
if [[ -n "$HELM_DIR" ]]; then
  [[ -d "$HELM_DIR" ]] || die_setup "helm dir not found: $HELM_DIR"
  EFFECTIVE_HELM="$HELM_DIR"
elif have score-helm; then
  mkdir -p "$TMP_HELM"
  pushd /workspace/gdfkube-src >/dev/null
  if [[ ! -d .score-helm ]]; then
    score-helm init --no-sample 2>/dev/null || true
  fi
  for f in "${SCORE_FILES[@]}"; do
    base=$(basename "$f" .yaml)
    score-helm generate "$f" -o "$TMP_HELM/${base}-values.yaml" >/dev/null 2>&1 || true
  done
  popd >/dev/null
  EFFECTIVE_HELM="$TMP_HELM"
else
  die_setup "score-helm CLI missing; use --helm <dir> to supply pre-rendered manifests"
fi

# ── extract env vars from compose ────────────────────────────────────────────
extract_compose_envvars() {
  local file="$1"
  if have yq; then
    # handle both map (KEY: val) and list (KEY=val) forms
    yq e '
      .services.[] |
      (.environment // {}) |
      if type == "!!map" then keys[]
      elif type == "!!seq" then .[] | split("=") | .[0]
      else empty
      end
    ' "$file" 2>/dev/null
  else
    # awk fallback: look for "environment:" blocks and grab keys
    awk '
      /^  [a-zA-Z_][a-zA-Z0-9_]*:/ { in_service=1 }
      in_service && /^ *environment:/ { in_env=1; next }
      in_env && /^ *[a-zA-Z_][a-zA-Z0-9_]*:/ {
        # map form: KEY: val
        match($0, /[a-zA-Z_][a-zA-Z0-9_]*/); print substr($0,RSTART,RLENGTH); next
      }
      in_env && /^ *- [A-Z_][A-Z0-9_]*=/ {
        # list form: - KEY=val
        match($0, /[A-Z_][A-Z0-9_]*/); print substr($0,RSTART,RLENGTH); next
      }
      in_env && /^ *[^ ]/ { in_env=0 }
    ' "$file"
  fi
}

# ── extract ports from compose ────────────────────────────────────────────────
extract_compose_ports() {
  local file="$1"
  if have yq; then
    yq e '
      .services.[] | (.ports // []) | .[] |
      if type == "!!str" then split(":") | last | split("/") | first
      elif type == "!!map" then (.target // .published) | tostring
      else empty
      end
    ' "$file" 2>/dev/null
  else
    grep -E '^ *- "[0-9]+:[0-9]+"' "$file" \
      | grep -oE '[0-9]+:[0-9]+' \
      | cut -d: -f2 \
      || true
  fi
}

# ── extract env vars from helm rendered manifests ────────────────────────────
extract_helm_envvars() {
  local dir="$1"
  if have yq; then
    find "$dir" -name '*.yaml' -print0 \
      | xargs -0 -I{} sh -c \
        'yq e ".spec.template.spec.containers[].env[]?.name" "{}" 2>/dev/null || true'
  else
    grep -rh '^ *- name: ' "$dir" \
      | grep -oE '[A-Z_][A-Z0-9_]+' \
      || true
  fi
}

# ── extract ports from helm rendered manifests ────────────────────────────────
extract_helm_ports() {
  local dir="$1"
  if have yq; then
    find "$dir" -name '*.yaml' -print0 \
      | xargs -0 -I{} sh -c \
        'yq e "select(.kind == \"Service\") | .spec.ports[]? | (.port,.targetPort) | tostring" "{}" 2>/dev/null || true'
  else
    grep -rh 'port:' "$dir" \
      | grep -oE '[0-9]+' \
      || true
  fi
}

# ── collect declared Score variables and resource refs ───────────────────────
collect_score_declared() {
  local vars=()
  for sf in "${SCORE_FILES[@]}"; do
    [[ -f "$sf" ]] || continue
    if have yq; then
      while IFS= read -r v; do
        [[ -n "$v" ]] && vars+=("$v")
      done < <(yq e '.containers.[].variables | keys | .[]' "$sf" 2>/dev/null || true)
    else
      while IFS= read -r v; do
        [[ -n "$v" ]] && vars+=("$v")
      done < <(grep -E '^ {6}[A-Z_][A-Z0-9_]*:' "$sf" \
               | grep -oE '[A-Z_][A-Z0-9_]+' || true)
    fi
  done
  printf '%s\n' "${vars[@]}" | sort -u
}

# ── normalise: sort unique non-empty lines ────────────────────────────────────
normalise() { grep -v '^$' | sort -u || true; }

# ── run extractions ───────────────────────────────────────────────────────────
mapfile -t COMPOSE_VARS  < <(extract_compose_envvars "$EFFECTIVE_COMPOSE" | normalise)
mapfile -t HELM_VARS     < <(extract_helm_envvars    "$EFFECTIVE_HELM"    | normalise)
mapfile -t COMPOSE_PORTS < <(extract_compose_ports   "$EFFECTIVE_COMPOSE" | normalise)
mapfile -t HELM_PORTS    < <(extract_helm_ports      "$EFFECTIVE_HELM"    | normalise)
mapfile -t SCORE_DECLARED < <(collect_score_declared | normalise)

# ── set arithmetic helpers ────────────────────────────────────────────────────
# intersect two arrays (both passed as sorted strings via process substitution)
intersect() {
  comm -12 <(printf '%s\n' "$@" | head -n "$1_count" ) # placeholder
  :
}

arr_to_set() { printf '%s\n' "$@" | sort -u; }

set_intersect() {
  comm -12 \
    <(printf '%s\n' "${!1}" | sort -u) \
    <(printf '%s\n' "${!2}" | sort -u)
}

set_diff() {
  # items in array-name-1 not in array-name-2
  comm -23 \
    <(printf '%s\n' "${!1}" | sort -u) \
    <(printf '%s\n' "${!2}" | sort -u)
}

# ── compute drift ─────────────────────────────────────────────────────────────
DRIFT=0
COMPOSE_ONLY=()
HELM_ONLY=()
STRAY=()
PORT_DRIFT=()

# env var cross-surface diff
while IFS= read -r v; do
  [[ -n "$v" ]] && COMPOSE_ONLY+=("$v")
done < <(comm -23 \
  <(printf '%s\n' "${COMPOSE_VARS[@]}" | sort -u) \
  <(printf '%s\n' "${HELM_VARS[@]}"    | sort -u) || true)

while IFS= read -r v; do
  [[ -n "$v" ]] && HELM_ONLY+=("$v")
done < <(comm -23 \
  <(printf '%s\n' "${HELM_VARS[@]}"    | sort -u) \
  <(printf '%s\n' "${COMPOSE_VARS[@]}" | sort -u) || true)

# stray: in either surface but not in Score declarations
ALL_SURFACE_VARS=()
while IFS= read -r v; do
  [[ -n "$v" ]] && ALL_SURFACE_VARS+=("$v")
done < <(printf '%s\n' "${COMPOSE_VARS[@]}" "${HELM_VARS[@]}" | sort -u || true)

while IFS= read -r v; do
  [[ -n "$v" ]] && STRAY+=("$v")
done < <(comm -23 \
  <(printf '%s\n' "${ALL_SURFACE_VARS[@]}" | sort -u) \
  <(printf '%s\n' "${SCORE_DECLARED[@]}"   | sort -u) || true)

# port diff
while IFS= read -r p; do
  [[ -n "$p" ]] && PORT_DRIFT+=("compose-only:$p")
done < <(comm -23 \
  <(printf '%s\n' "${COMPOSE_PORTS[@]}" | sort -u) \
  <(printf '%s\n' "${HELM_PORTS[@]}"    | sort -u) || true)

while IFS= read -r p; do
  [[ -n "$p" ]] && PORT_DRIFT+=("helm-only:$p")
done < <(comm -23 \
  <(printf '%s\n' "${HELM_PORTS[@]}"    | sort -u) \
  <(printf '%s\n' "${COMPOSE_PORTS[@]}" | sort -u) || true)

DRIFT=$(( ${#COMPOSE_ONLY[@]} + ${#HELM_ONLY[@]} + ${#STRAY[@]} + ${#PORT_DRIFT[@]} ))

# ── matched count ─────────────────────────────────────────────────────────────
MATCHED=0
while IFS= read -r v; do
  [[ -n "$v" ]] && (( MATCHED++ )) || true
done < <(comm -12 \
  <(printf '%s\n' "${COMPOSE_VARS[@]}" | sort -u) \
  <(printf '%s\n' "${HELM_VARS[@]}"    | sort -u) || true)

N_COMPOSE=${#COMPOSE_VARS[@]}
N_HELM=${#HELM_VARS[@]}

# ── output ────────────────────────────────────────────────────────────────────
if [[ $DRIFT -eq 0 || $PRINT_MODE -eq 1 ]]; then
  echo "score-parity: compose=${N_COMPOSE} helm=${N_HELM} matched=${MATCHED} drift=${DRIFT}"
fi

if [[ $DRIFT -gt 0 ]]; then
  if [[ ${#HELM_ONLY[@]} -gt 0 ]]; then
    echo "[G1] helm-only env vars: ${HELM_ONLY[*]}" >&2
  fi
  if [[ ${#COMPOSE_ONLY[@]} -gt 0 ]]; then
    echo "[G1] compose-only env vars: ${COMPOSE_ONLY[*]}" >&2
  fi
  if [[ ${#STRAY[@]} -gt 0 ]]; then
    echo "[G1] stray (not declared in Score): ${STRAY[*]}" >&2
  fi
  if [[ ${#PORT_DRIFT[@]} -gt 0 ]]; then
    echo "[G1] port drift: ${PORT_DRIFT[*]}" >&2
  fi
  exit 1
fi

exit 0
