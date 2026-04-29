#!/usr/bin/env bash
# connector-parity.sh — Guardrail G2 (§3.6): connector.json is the single
# source of truth for KafkaConnector config fields. Exits non-zero on drift.
# TSK-005-03-01, traces REQ-005-03.
set -euo pipefail

CONNECTOR_JSON="/workspace/gdfkube-src/connector.json"
TEMPLATE_YAML="/workspace/gdfkube-src/scripts/strimzi-kafka-connector.template.yaml"
PRINT_ALWAYS=0

for arg in "$@"; do
  [[ "$arg" == "--print" ]] && PRINT_ALWAYS=1
done

# --- input file guards ---
if [[ ! -f "$CONNECTOR_JSON" ]]; then
  echo "connector-parity: $CONNECTOR_JSON not found" >&2
  exit 2
fi
if [[ ! -f "$TEMPLATE_YAML" ]]; then
  echo "connector-parity: $TEMPLATE_YAML not found" >&2
  exit 2
fi

# --- Phase-0 guard: no transforms.* keys in connector.json (SCN-006-01-02) ---
transforms_keys=$(jq -r '.config | keys[] | select(startswith("transforms"))' "$CONNECTOR_JSON")
if [[ -n "$transforms_keys" ]]; then
  echo "[G2] transforms keys forbidden in Phase 0: $(echo "$transforms_keys" | tr '\n' ' ')" >&2
  exit 1
fi

# --- extract connector.json name and config ---
cj_name=$(jq -r '.name' "$CONNECTOR_JSON")
# Build associative array: key -> value
declare -A cj_config
while IFS=$'\t' read -r k v; do
  cj_config["$k"]="$v"
done < <(jq -r '.config | to_entries[] | [.key, (.value | tostring)] | @tsv' "$CONNECTOR_JSON")

# --- extract template name and spec.config ---
# In Strimzi, `connector.class` lives at spec.class (top-level on the CR), not under
# spec.config. We materialize it back into the tmpl_config map under the key
# "connector.class" so downstream comparison against connector.json's flat .config
# block sees the same shape.
tmpl_name=$(yq e '.metadata.name' "$TEMPLATE_YAML")
declare -A tmpl_config
while IFS=$'\t' read -r k v; do
  tmpl_config["$k"]="$v"
done < <(yq e '.spec.config | to_entries[] | [.key, (.value | tostring)] | @tsv' "$TEMPLATE_YAML")
spec_class=$(yq e '.spec.class // ""' "$TEMPLATE_YAML")
if [[ -n "$spec_class" && "$spec_class" != "null" ]]; then
  tmpl_config["connector.class"]="$spec_class"
fi

drift=0
violations=()

# --- assert metadata.name parity ---
if [[ "$tmpl_name" != "$cj_name" ]]; then
  violations+=("[G2] name drifts: connector.json=${cj_name} template=${tmpl_name}")
  drift=$((drift+1))
fi

total=${#cj_config[@]}
matched=0

# --- keys in connector.json but absent from template ---
for key in "${!cj_config[@]}"; do
  if [[ -v tmpl_config["$key"] ]]; then
    cj_val="${cj_config[$key]}"
    tmpl_val="${tmpl_config[$key]}"
    if [[ "$cj_val" == "$tmpl_val" ]]; then
      matched=$((matched+1))
    else
      violations+=("[G2] field ${key} drifts: connector.json=${cj_val} template=${tmpl_val}")
      drift=$((drift+1))
    fi
  else
    violations+=("[G2] connector.json key absent from KafkaConnector CR: ${key}")
    drift=$((drift+1))
  fi
done

# --- keys in template but not in connector.json (inline overrides) ---
for key in "${!tmpl_config[@]}"; do
  if [[ ! -v cj_config["$key"] ]]; then
    violations+=("[G2] inline override in KafkaConnector CR: ${key}=${tmpl_config[$key]}")
    drift=$((drift+1))
  fi
done

summary="connector-parity: connector.json fields=${total} matched=${matched} drift=${drift}"

if [[ $drift -gt 0 ]]; then
  echo "$summary"
  for v in "${violations[@]}"; do
    echo "$v" >&2
  done
  exit 1
else
  [[ $PRINT_ALWAYS -eq 1 ]] && echo "$summary"
  exit 0
fi
