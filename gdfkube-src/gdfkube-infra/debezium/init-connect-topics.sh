#!/bin/bash
set -euo pipefail
BOOTSTRAP="kafka1:19092"
KAFKA_BIN="/opt/kafka/bin"

create() {
  local topic="$1" partitions="$2"
  "$KAFKA_BIN/kafka-topics.sh" --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
    --topic "$topic" --partitions "$partitions" --replication-factor 3
  "$KAFKA_BIN/kafka-configs.sh" --bootstrap-server "$BOOTSTRAP" --entity-type topics \
    --entity-name "$topic" --alter --add-config "cleanup.policy=compact"
  echo "topic $topic ready"
}

create connect-configs 1
create connect-offsets 25
create connect-status 5
echo "connect topics ready"
