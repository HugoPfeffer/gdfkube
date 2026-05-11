# Kafka Broker Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a 3-broker Kafka 3.7 KRaft cluster in the root `docker-compose.yml` with all 9 catalog topics pre-created by an idempotent init container, plus a documented connection contract for downstream specs.

**Architecture:** Three combined controller+broker KRaft nodes on `gdfkube-net` with a fixed cluster ID for deterministic quorum. A one-shot `kafka-init` service runs a bind-mounted shell script that creates topics using `kafka-topics.sh --create --if-not-exists` and configures retention/min.insync.replicas via `kafka-configs.sh`. Only `kafka1` is host-accessible at `127.0.0.1:9092`.

**Tech Stack:** Apache Kafka 3.7 (`apache/kafka:3.7`), Docker Compose, Bash

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `docker-compose.yml` | Modify | Add `kafka1`, `kafka2`, `kafka3`, `kafka-init` services and 3 named volumes |
| `gdfkube-src/gdfkube-infra/kafka/init-topics.sh` | Create | Idempotent topic creation script (9 topics with exact configs) |
| `gdfkube-src/gdfkube-infra/kafka/README.md` | Create | Connection contract: bootstrap strings, consumer groups, producer/consumer config, DLQ headers |

---

### Task 1: Generate Kafka cluster ID

**Files:**
- Modify: `docker-compose.yml`

The cluster ID must be a base64-encoded UUID, 22 characters. We generate one once and hard-code it.

- [ ] **Step 1: Generate a cluster ID**

Run:

```bash
docker run --rm apache/kafka:3.7 /opt/kafka/bin/kafka-storage.sh random-uuid
```

Expected: A 22-character base64 string (e.g., `MkU3OEVBNTcwNTJENDM2Qg`). Record this value for use in subsequent steps.

---

### Task 2: Add kafka1 service to docker-compose.yml

**Files:**
- Modify: `docker-compose.yml:114-117` (before the `volumes:` section)

- [ ] **Step 1: Add kafka1 service definition**

Insert before the `networks:` section in `docker-compose.yml`:

```yaml
  kafka1:
    image: apache/kafka:3.7
    ports:
      - "127.0.0.1:9092:9092"
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:19092,CONTROLLER://0.0.0.0:9093,HOST://0.0.0.0:9092
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka1:19092,HOST://127.0.0.1:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT,HOST:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_CLUSTER_ID: <CLUSTER_ID_FROM_TASK_1>
      KAFKA_LOG_DIRS: /var/lib/kafka/data
    volumes:
      - kafka1-data:/var/lib/kafka/data
    networks:
      - gdfkube-net
    healthcheck:
      test: ["CMD-SHELL", "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:19092 | grep -q ApiVersion"]
      interval: 10s
      timeout: 10s
      retries: 10
      start_period: 30s
```

Replace `<CLUSTER_ID_FROM_TASK_1>` with the actual cluster ID generated in Task 1.

Note: `kafka1` uses three listeners — `PLAINTEXT` on 19092 for inter-broker traffic, `CONTROLLER` on 9093 for KRaft quorum, and `HOST` on 9092 mapped to the host at `127.0.0.1:9092`. The healthcheck targets the internal PLAINTEXT port.

- [ ] **Step 2: Validate compose syntax**

Run:

```bash
docker compose config --services | grep kafka1
```

Expected: `kafka1` in output, no YAML parse errors.

---

### Task 3: Add kafka2 and kafka3 services

**Files:**
- Modify: `docker-compose.yml` (after kafka1 service)

- [ ] **Step 1: Add kafka2 service definition**

Insert after `kafka1` service:

```yaml
  kafka2:
    image: apache/kafka:3.7
    environment:
      KAFKA_NODE_ID: 2
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:19092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka2:19092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_CLUSTER_ID: <CLUSTER_ID_FROM_TASK_1>
      KAFKA_LOG_DIRS: /var/lib/kafka/data
    volumes:
      - kafka2-data:/var/lib/kafka/data
    networks:
      - gdfkube-net
    healthcheck:
      test: ["CMD-SHELL", "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:19092 | grep -q ApiVersion"]
      interval: 10s
      timeout: 10s
      retries: 10
      start_period: 30s
```

- [ ] **Step 2: Add kafka3 service definition**

Insert after `kafka2` service:

```yaml
  kafka3:
    image: apache/kafka:3.7
    environment:
      KAFKA_NODE_ID: 3
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:19092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka3:19092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_CLUSTER_ID: <CLUSTER_ID_FROM_TASK_1>
      KAFKA_LOG_DIRS: /var/lib/kafka/data
    volumes:
      - kafka3-data:/var/lib/kafka/data
    networks:
      - gdfkube-net
    healthcheck:
      test: ["CMD-SHELL", "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:19092 | grep -q ApiVersion"]
      interval: 10s
      timeout: 10s
      retries: 10
      start_period: 30s
```

Replace `<CLUSTER_ID_FROM_TASK_1>` in both services with the actual cluster ID.

Note: `kafka2` and `kafka3` have NO `ports:` section — they are only accessible via Docker DNS on `gdfkube-net`. They only declare `PLAINTEXT` and `CONTROLLER` listeners (no `HOST` listener).

- [ ] **Step 3: Add named volumes**

Add to the `volumes:` section at the end of `docker-compose.yml`:

```yaml
  kafka1-data:
  kafka2-data:
  kafka3-data:
```

- [ ] **Step 4: Validate compose syntax**

Run:

```bash
docker compose config --services | grep -E 'kafka[123]'
```

Expected: `kafka1`, `kafka2`, `kafka3` in output, no YAML parse errors.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "add kafka1/2/3 KRaft broker services to compose stack"
```

---

### Task 4: Create init-topics.sh

**Files:**
- Create: `gdfkube-src/gdfkube-infra/kafka/init-topics.sh`

- [ ] **Step 1: Create the kafka infra directory**

```bash
mkdir -p gdfkube-src/gdfkube-infra/kafka
```

- [ ] **Step 2: Write init-topics.sh**

Create `gdfkube-src/gdfkube-infra/kafka/init-topics.sh`:

```bash
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

# CDC topics (7-day retention)
create_topic "dbz.gdfkube.requests"      6 3 604800000
create_topic "dbz.gdfkube.forms"          1 3 604800000

# Pipeline topics
create_topic "gdfkube.pipeline.status"    6 3 1209600000   # 14-day
create_topic "gdfkube.audit"              3 3 2592000000   # 30-day

# DLQ topics (30-day retention)
create_topic "dlq.gdfkube.requests"       3 3 2592000000
create_topic "dlq.gdfkube.helm-render"    1 3 2592000000
create_topic "dlq.gdfkube.git-push"       1 3 2592000000
create_topic "dlq.gdfkube.repo-bootstrap" 1 3 2592000000
create_topic "dlq.gdfkube.debezium"       1 3 2592000000

echo "=== All 9 topics created successfully ==="
```

- [ ] **Step 3: Make script executable**

```bash
chmod +x gdfkube-src/gdfkube-infra/kafka/init-topics.sh
```

- [ ] **Step 4: Commit**

```bash
git add gdfkube-src/gdfkube-infra/kafka/init-topics.sh
git commit -m "add idempotent kafka topic init script"
```

---

### Task 5: Add kafka-init service to docker-compose.yml

**Files:**
- Modify: `docker-compose.yml` (after kafka3 service, before `networks:`)

- [ ] **Step 1: Add kafka-init service definition**

Insert after `kafka3` service:

```yaml
  kafka-init:
    image: apache/kafka:3.7
    restart: "no"
    depends_on:
      kafka1:
        condition: service_healthy
      kafka2:
        condition: service_healthy
      kafka3:
        condition: service_healthy
    volumes:
      - ${COMPOSE_HOST_WORKSPACE:-.}/gdfkube-src/gdfkube-infra/kafka/init-topics.sh:/scripts/init-topics.sh:ro
    networks:
      - gdfkube-net
    entrypoint: ["bash", "/scripts/init-topics.sh"]
```

Note: the bind-mount pattern (`${COMPOSE_HOST_WORKSPACE:-.}` prefix, `:ro` suffix, `/scripts/` target) mirrors the existing `mongo-init` service.

- [ ] **Step 2: Validate compose syntax**

```bash
docker compose config --services | grep kafka-init
```

Expected: `kafka-init` in output.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "add kafka-init one-shot topic creation service"
```

---

### Task 6: Create connection contract README

**Files:**
- Create: `gdfkube-src/gdfkube-infra/kafka/README.md`

- [ ] **Step 1: Write README.md**

Create `gdfkube-src/gdfkube-infra/kafka/README.md` with:

```markdown
# Kafka Connection Contract

Bootstrap and configuration reference for services connecting to the Kafka cluster.

## Bootstrap Endpoints

| Context | Bootstrap String |
|---|---|
| Inter-container (compose services on `gdfkube-net`) | `kafka1:19092,kafka2:19092,kafka3:19092` |
| Host-side dev tooling | `127.0.0.1:9092` |

## Consumer Groups

| Group ID | Used By | Topics |
|---|---|---|
| `gdfkube-camel` | Camel routes | `dbz.gdfkube.requests`, `dbz.gdfkube.forms`, `dlq.gdfkube.*` |
| `itsm-sse-{podName}` | Express SSE (per-replica for broadcast fan-out) | `gdfkube.pipeline.status` |

In compose, `{podName}` resolves to the container hostname.

## Required Producer Config

```properties
enable.idempotence=true
acks=all
max.in.flight.requests.per.connection=5
```

These settings ensure at-least-once delivery with idempotent deduplication within a session.

## Required Consumer Config

```properties
enable.auto.commit=false
```

- **Camel pipeline consumers**: `auto.offset.reset=earliest` — process all unprocessed events on restart.
- **Express SSE consumers**: `auto.offset.reset=latest` — only deliver real-time updates, skip history.

Camel consumers MUST call `kafkaManualCommit.commitSync()` only after the unit of work succeeds.

## DLQ Context Headers

When a Camel route exhausts its retry budget (3 attempts; 1s/5s/30s exponential backoff), it produces the failed message to `dlq.gdfkube.{route}` with these context headers:

| Header | Example |
|---|---|
| `x-original-topic` | `dbz.gdfkube.requests` |
| `x-original-partition` | `4` |
| `x-original-offset` | `1234567` |
| `x-original-key` | `01HK6X3F5G9Q...` |
| `x-error-class` | `org.apache.camel.RuntimeCamelException` |
| `x-error-msg` | `"Helm render failed: missing required value vars.clusterName"` |
| `x-stage` | `camel.helm-render` |
| `x-attempts` | `3` |
| `x-first-failure-at` | `2026-05-05T12:34:56Z` |
| `x-replayed` | `false` |

Replay sets `x-replayed: true` and re-publishes to `x-original-topic`. Replay is a manual CLI operation.
```

- [ ] **Step 2: Commit**

```bash
git add gdfkube-src/gdfkube-infra/kafka/README.md
git commit -m "add kafka connection contract documentation"
```

---

### Task 7: End-to-end verification

**Files:** (none — verification only)

- [ ] **Step 1: Bring up brokers**

```bash
docker compose up -d kafka1 kafka2 kafka3
```

Wait up to 60 seconds. Check:

```bash
docker compose ps kafka1 kafka2 kafka3
```

Expected: all three in state `healthy`.

- [ ] **Step 2: Run kafka-init**

```bash
docker compose up kafka-init
```

Expected: exits 0 with "All 9 topics created successfully".

- [ ] **Step 3: Verify topic list**

```bash
docker compose exec -T kafka1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:19092 --list
```

Expected: all 9 topic names printed.

- [ ] **Step 4: Verify topic configs**

For each topic, run:

```bash
docker compose exec -T kafka1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:19092 --describe --topic dbz.gdfkube.requests
```

Expected: `PartitionCount: 6`, `ReplicationFactor: 3`.

```bash
docker compose exec -T kafka1 /opt/kafka/bin/kafka-configs.sh --bootstrap-server localhost:19092 --entity-type topics --entity-name dbz.gdfkube.requests --describe
```

Expected: `retention.ms=604800000`, `min.insync.replicas=2`, `cleanup.policy=delete`.

Repeat for all 9 topics against the catalog values.

- [ ] **Step 5: Verify idempotent re-init**

```bash
docker compose run --rm kafka-init
```

Expected: exits 0. Re-run topic describe — output identical to Step 4.

- [ ] **Step 6: Verify host-side produce/consume**

```bash
echo "probe-message" | docker compose exec -T kafka1 /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server 127.0.0.1:9092 --topic gdfkube.audit
docker compose exec -T kafka1 /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server 127.0.0.1:9092 --topic gdfkube.audit --from-beginning --max-messages 1 --timeout-ms 10000
```

Expected: `probe-message` returned.

- [ ] **Step 7: Verify single-broker-loss tolerance**

```bash
docker compose stop kafka2
echo "loss-test" | docker compose exec -T kafka1 /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server kafka1:19092 --topic gdfkube.audit
docker compose exec -T kafka1 /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server kafka1:19092 --topic gdfkube.audit --from-beginning --max-messages 2 --timeout-ms 10000
docker compose start kafka2
```

Expected: produce and consume succeed with kafka2 down.

- [ ] **Step 8: Verify cold-start from down -v**

```bash
docker compose down -v
docker compose up -d kafka1 kafka2 kafka3
# wait for healthy
docker compose up kafka-init
docker compose exec -T kafka1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:19092 --list
```

Expected: all 9 topics listed on a fresh cluster.
