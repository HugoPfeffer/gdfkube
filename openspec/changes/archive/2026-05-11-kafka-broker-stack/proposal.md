## Why

The project's event spine — Kafka — is the next infrastructure component to land after MongoDB. The demo's provisioning pipeline requires a producer/consumer fabric for CDC events (Debezium), pipeline-stage orchestration (Camel), and SSE delivery (Express). Without the broker layer, none of those downstream specs can be developed or tested. Standing up the Kafka cluster now, with the full topic catalog pre-declared, gives downstream specs a stable bootstrap endpoint and pre-created topics to wire against immediately — eliminating a serial dependency from the critical path.

## What Changes

**New compose services for Kafka brokers**
- Three Kafka 3.7 broker services (`kafka1`, `kafka2`, `kafka3`) added to root `docker-compose.yml` in KRaft mode with combined controller+broker roles, each with a named volume and healthcheck, on `gdfkube-net`.

**New one-shot init service for topic creation**
- A `kafka-init` service runs a bind-mounted `init-topics.sh` script that idempotently creates all 9 topics from the doc catalog with exact partition, RF, retention, and min.insync.replicas settings.

**Host-accessible bootstrap for dev tooling**
- Only `kafka1` publishes `127.0.0.1:9092` for host-side access, mirroring the mongo1 loopback pattern.

**Connection contract documentation**
- A `gdfkube-src/gdfkube-infra/kafka/README.md` documents bootstrap strings, consumer-group naming, required producer/consumer configs, and the DLQ header convention — serving as the handoff for Debezium, Camel, and Express specs.

## Capabilities

### New Capabilities

- `kafka-broker-stack`: Three-broker KRaft Kafka cluster with idempotent topic creation, named volumes, healthchecks, and loopback-only host binding — plus the documented connection contract for downstream consumers and producers.

### Modified Capabilities

(none — no existing spec requirements change)

## Impact

- **Files touched**: `docker-compose.yml` (edit), `gdfkube-src/gdfkube-infra/kafka/init-topics.sh` (create), `gdfkube-src/gdfkube-infra/kafka/README.md` (create)
- **Dependencies added**: `apache/kafka:3.7` container image (new to the stack)
- **Existing services**: No changes to mongo stack, itsm, or itsm-api services. Kafka services join the same `gdfkube-net` bridge so future services can reach both stacks.
- **Downstream consumers**: None wired in this change — Debezium, Camel, and Express are future specs that will consume the topics and connection contract created here.
- **Testing strategy**: End-to-end verification via `docker compose` commands: broker health, topic describe/list, produce/consume probes, idempotent re-init, broker-loss tolerance, and cold-start from `down -v`.
