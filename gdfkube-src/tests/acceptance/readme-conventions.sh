#!/usr/bin/env bash
# readme-conventions.sh — assert README documents the §0.3 naming conventions.
# Each pattern below MUST appear at least once in gdfkube-src/README.md.
set -uo pipefail

README="/workspace/gdfkube-src/README.md"
[[ -f "$README" ]] || { echo "readme-conventions: $README not found" >&2; exit 1; }

declare -A patterns=(
  [HostedCluster_name]='hc-\{org\}-\{cluster\}'
  [ApplicationSet_name]='appset-\{org\}-\{cluster\}'
  [canonical_label]='gdfkube\.gov/org'
  [clusterset_label]='clusterset'
)

missing=()
for key in "${!patterns[@]}"; do
  if ! grep -qE "${patterns[$key]}" "$README"; then
    missing+=("$key (pattern: ${patterns[$key]})")
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo "readme-conventions: MISSING patterns:" >&2
  for m in "${missing[@]}"; do echo "  - $m" >&2; done
  exit 1
fi
echo "readme-conventions: PASS (${#patterns[@]}/${#patterns[@]} patterns present)"
