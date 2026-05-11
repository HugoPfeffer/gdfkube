## Context

The demo stack runs from a root `docker-compose.yml` that currently hosts a MongoDB 3-node replica set (`mongo1/2/3` + `mongo-init` + `mongo-seed`), the ITSM API (`gdfkube-itsm-api`), and the ITSM frontend (`itsm`), all on the `gdfkube-net` bridge network. The next infrastructure layer is Kafka — the event spine described in `docs/05-kafka.md` — which carries CDC events from Debezium, pipeline-stage events from Camel, and SSE updates to Express.

This design adds the Kafka broker layer to the existing compose file, following the structural patterns established by the mongo stack.

## Goals / Non-Goals

**Goals:**
- Run a 3-broker Kafka 3.7 KRaft cluster in the existing compose stack
- Pre-create all 9 topics from the doc catalog with exact settings
- Expose a stable bootstrap for both in-network and host-side access
- Mirror mongo-stack patterns for uniformity (named volumes, healthchecks, init container, loopback binding)
- Document the connection contract for downstream specs

**Non-Goals:**
- Debezium connector deployment (future spec)
- Camel route source code or container (future spec)
- Express SSE consumer wiring (future spec)
- Strimzi Operator / Kubernetes `KafkaTopic` CRs (production plane — separate spec)
- TLS, mTLS, SASL, ACLs, quotas (deferred per doc)
- Lag monitoring, alerting, JMX export (deferred to observability spec)
- Schema registry (doc says plain JSON, no registry)
- DR / cross-region replication (doc explicitly out of scope)
- Log compaction (doc explicitly says no compaction)

## Decisions

### 1. Image: `apache/kafka:3.7`

The `docs/05-kafka.md` specifies "Apache Kafka 3.7+". The official Apache image (`apache/kafka:3.7.2`) supports env-var configuration natively and includes KRaft support without needing Strimzi or Confluent wrappers. Alternative: Confluent `cp-kafka` — rejected because it pulls in the Confluent ecosystem and license, adding unnecessary weight for a demo stack.

### 2. KRaft with combined controller+broker roles

Each of the 3 nodes runs both controller and broker roles (`process.roles=broker,controller`). This minimizes container count while matching the doc's 3-broker KRaft specification. Alternative: dedicated controller nodes — rejected because it would require 6 containers for a dev stack with no practical benefit.

### 3. Fixed cluster ID for deterministic quorum

A hard-coded `KAFKA_CLUSTER_ID` (generated once, committed) ensures that `docker compose down -v && up` yields the same quorum identity. The `KAFKA_CONTROLLER_QUORUM_VOTERS` string is `1@kafka1:9093,2@kafka2:9093,3@kafka3:9093` — controller traffic on port 9093 (internal), broker traffic on 9092.

### 4. Host port mapping mirrors mongo pattern

Only `kafka1` publishes `127.0.0.1:9092`. `kafka2` and `kafka3` have no host port mappings. This mirrors the mongo stack where only `mongo1` publishes `127.0.0.1:27017`. The `KAFKA_ADVERTISED_LISTENERS` on `kafka1` includes both the Docker-internal listener and a `localhost:9092` listener so that host-side tools (kafkacat, kcat, CLI scripts) can connect.

### 5. One-shot `kafka-init` for topic creation

A `kafka-init` service with `restart: "no"` and `depends_on` all three brokers `condition: service_healthy` runs `gdfkube-src/gdfkube-infra/kafka/init-topics.sh`. The script uses `kafka-topics.sh --create --if-not-exists` for each topic, then `kafka-configs.sh --alter` to set `retention.ms` and `min.insync.replicas`. This mirrors `mongo-init`'s shape and is idempotent by design.

### 6. Listener configuration

Each broker exposes two listeners:
- `PLAINTEXT` on port 9092 — for inter-broker and client traffic on `gdfkube-net`
- `CONTROLLER` on port 9093 — for KRaft controller quorum

`kafka1` additionally advertises a `HOST` listener mapped to `127.0.0.1:9092` for host-side dev tooling. The dual-listener on kafka1 uses `KAFKA_LISTENER_SECURITY_PROTOCOL_MAP` to map both to PLAINTEXT.

### 7. Named volumes at `/var/lib/kafka/data`

Each broker gets a named volume (`kafka1-data`, `kafka2-data`, `kafka3-data`) mounted at `/var/lib/kafka/data`. This mirrors the mongo `mongo{N}-data` at `/data/db` pattern and ensures data persistence across restarts.

### 8. Healthcheck via `kafka-broker-api-versions.sh`

Each broker healthcheck runs `kafka-broker-api-versions.sh --bootstrap-server localhost:9092`. This verifies the broker is up and accepting connections — equivalent to mongo's `db.adminCommand('ping')` pattern.

## Risks / Trade-offs

**[Combined controller+broker resource usage]** → In production, dedicated controllers are preferred. For a 3-node dev/demo stack, the memory overhead is negligible. If resource pressure appears, the design can be split later without topic/data migration.

**[Fixed cluster ID in source control]** → The cluster ID is not a secret (it's a metadata identifier), but it ties all local dev environments to the same quorum identity. This is intentional for reproducibility. If isolation is needed, developers can override via `.env`.

**[Single host-accessible broker]** → Only `kafka1:9092` is reachable from the host. If `kafka1` is down, host-side tools lose access. This matches the mongo pattern and is acceptable for dev — the in-network bootstrap (`kafka1:9092,kafka2:9092,kafka3:9092`) remains fully available to compose services.

**[No TLS/auth in dev stack]** → All traffic is PLAINTEXT on a Docker bridge. Acceptable for a local demo; production K8s stack will use Strimzi-managed TLS (separate spec).
