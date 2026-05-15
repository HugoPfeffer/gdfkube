#!/bin/bash
set -euo pipefail

BOOTSTRAP="kafka1:19092"
KAFKA_BIN="/opt/kafka/bin"

create_topic() {
  local topic="$1" partitions="$2" rf="$3" retention_ms="$4"

  "$KAFKA_BIN/kafka-topics.sh" \
    --bootstrap-server "$BOOTSTRAP" \
    --create \
    --if-not-exists \
    --topic "$topic" \
    --partitions "$partitions" \
    --replication-factor "$rf"

  "$KAFKA_BIN/kafka-configs.sh" \
    --bootstrap-server "$BOOTSTRAP" \
    --entity-type topics \
    --entity-name "$topic" \
    --alter \
    --add-config "retention.ms=$retention_ms,min.insync.replicas=2,cleanup.policy=delete"

  echo "Topic '$topic' ready (partitions=$partitions, rf=$rf, retention=${retention_ms}ms)"
}

echo "=== Creating Kafka topics ==="

create_topic "dbz.gdfkube.requests"      6 3 604800000
create_topic "dbz.gdfkube.forms"          1 3 604800000
create_topic "dbz.gdfkube.groups"         1 3 604800000

create_topic "gdfkube.pipeline.status"    6 3 1209600000
create_topic "gdfkube.audit"              3 3 2592000000

create_topic "dlq.gdfkube.request-router"  3 3 2592000000
create_topic "dlq.gdfkube.helm-render"    1 3 2592000000
create_topic "dlq.gdfkube.git-push"       1 3 2592000000
create_topic "dlq.gdfkube.repo-bootstrap" 1 3 2592000000
create_topic "dlq.gdfkube.groups"         1 3 2592000000
create_topic "dlq.gdfkube.status-emitter" 1 3 2592000000
create_topic "dlq.gdfkube.audit-sink"     1 3 2592000000
create_topic "dlq.gdfkube.config-reload"  1 3 2592000000
create_topic "dlq.gdfkube.debezium"       1 3 2592000000

echo "=== All 14 topics created successfully ==="
