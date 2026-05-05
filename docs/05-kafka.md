# Kafka

> **Implementation Status:** Planned
> **Source:** Handoff `app.jsx` (topics, retention, semantics)
> **Last validated:** 2026-05-05

## Role in the Pipeline

```
[Debezium] ──▶ [Kafka topics] ──▶ [Camel routes] ──▶ ... ──▶ [Camel status-emitter] ──▶ [Express SSE]
                    │
                    └─▶ DLQ topics ──▶ [Camel dlq-handler] ──▶ MongoDB dlq_log
```

Kafka is the event spine. Every state change in the pipeline travels through
a topic. There are no direct service-to-service calls in the provisioning path.

## Responsibilities

- Buffer change events between MongoDB (via Debezium) and Camel.
- Carry pipeline-stage events from Camel to Express for SSE delivery.
- Hold dead-letter messages for retry-exhausted events.
- **Does NOT** transform messages, run business logic, or hold long-term state. Topics are sized for transit, not archive.

## Design

### Tech

- Strimzi Operator + Apache Kafka 3.7+.
- Namespace: `gdfkube-kafka`.
- Cluster CR: `gdfkube-kafka` with 3 brokers, KRaft mode (or ZooKeeper-less, per Strimzi default).
- Topics declared as Strimzi `KafkaTopic` CRs alongside the cluster — no auto-create.

### Bootstrap Endpoint

`gdfkube-kafka-bootstrap.gdfkube-kafka:9092` (in-cluster). External access not exposed; consumers and producers all run in the hub cluster.

### Topic Catalog

| Topic | Partitions | Replication | Retention | Producer | Consumer | Purpose |
|---|---|---|---|---|---|---|
| `dbz.gdfkube.requests` | 6 | 3 | 7d | Debezium | Camel `request-router` | Request CDC events. Key = `requestId`. |
| `dbz.gdfkube.forms` | 1 | 3 | 7d | Debezium | Camel `config-reload` | FormDef CDC events. Drives in-memory schema cache. |
| `gdfkube.pipeline.status` | 6 | 3 | 14d | Camel `status-emitter` | Express (SSE) | Stage-progress events. Key = `requestId`. |
| `gdfkube.audit` | 3 | 3 | 30d | Camel `audit-sink` | (none — sink to Mongo `audit_log`) | Append-only audit stream. |
| `dlq.gdfkube.requests` | 3 | 3 | 30d | Camel | Camel `dlq-handler` | Failed `request-router` events. |
| `dlq.gdfkube.helm-render` | 1 | 3 | 30d | Camel | Camel `dlq-handler` | Helm rendering errors. |
| `dlq.gdfkube.git-push` | 1 | 3 | 30d | Camel | Camel `dlq-handler` | Git push errors. |
| `dlq.gdfkube.repo-bootstrap` | 1 | 3 | 30d | Camel | Camel `dlq-handler` | Gitea repo creation errors. |
| `dlq.gdfkube.debezium` | 1 | 3 | 30d | Debezium | Camel `dlq-handler` | Connector-level deserialization/transform errors. |

### Delivery Semantics

**At-least-once.** This was a contradiction in the handoff and is now canonical:

- **Producers** are idempotent (`enable.idempotence=true`) — duplicate sends within a session are deduped by Kafka.
- **Camel consumers** disable auto-commit (`autoCommitEnable=false`) and call `kafkaManualCommit.commitSync()` only after the unit of work succeeds (e.g., after Helm render + Git push both return).
- **Downstream operations are idempotent**: Git commits include `requestId` and use deterministic file paths so re-applying a message yields no diff. MongoDB writes use `requestId` as the deduplication key.
- The handoff's "exactly-once via idempotent producers" claim is **rejected** — exactly-once would require Kafka transactions and read-committed consumers, which we do not use.

### DLQ Convention

When a Camel route exhausts its retry budget (3 attempts; 1s/5s/30s exponential backoff), it produces the failed message to the matching `dlq.gdfkube.{route}` topic with these context headers:

```
x-original-topic       : dbz.gdfkube.requests
x-original-partition   : 4
x-original-offset      : 1234567
x-original-key         : 01HK6X3F5G9Q...
x-error-class          : org.apache.camel.RuntimeCamelException
x-error-msg            : "Helm render failed: missing required value vars.clusterName"
x-stage                : camel.helm-render
x-attempts             : 3
x-first-failure-at     : 2026-05-05T12:34:56Z
x-replayed             : false
```

Replay sets `x-replayed: true` on the message and re-publishes to `x-original-topic`. Replay is a manual CLI operation.

### Topic Naming

- `dbz.gdfkube.{collection}` — Debezium output (CDC).
- `gdfkube.{purpose}` — Internal pipeline topics.
- `dlq.gdfkube.{route}` — Per-route dead-letter.

## Interfaces

| Producer | Topic(s) |
|---|---|
| Debezium | `dbz.gdfkube.*`, `dlq.gdfkube.debezium` |
| Camel | `gdfkube.pipeline.status`, `gdfkube.audit`, `dlq.gdfkube.*` |

| Consumer group | Topics |
|---|---|
| `gdfkube-camel` | `dbz.gdfkube.requests`, `dbz.gdfkube.forms`, `dlq.gdfkube.*` |
| `itsm-sse-{podName}` | `gdfkube.pipeline.status` (per-replica unique to fan out broadcast) |

## Operational Concerns

- **Lag monitoring** is deferred (see [13-observability.md](./13-observability.md)).
- **Compaction:** none of the topics use log-compaction. Pipeline events are time-bounded; the source of truth is MongoDB.
- **Replication factor 3** — tolerates one broker loss. Required for the production demo target. min.insync.replicas=2.
- **Schema discipline:** plain JSON, no registry. Field additions are backward-compatible if Camel uses defensive `Optional` access.

## Decisions Resolved

- Semantics: **at-least-once with manual commit + idempotent producers + idempotent downstream**. Exactly-once claim removed.
- DLQ topology: per-route `dlq.gdfkube.{route}` plus connector-level `dlq.gdfkube.debezium`.
- Retention: CDC=7d, status=14d, audit=30d, DLQ=30d.
- No schema registry (Debezium uses plain JSON converters).
- No external listener — Kafka stays in-cluster.

## Open Questions

- TLS/mTLS configuration between Strimzi and clients: assumed default Strimzi TLS, not pinned in handoff.
- Quotas per consumer group: not specified.
- DR: cross-region replication not in scope.

## References

- [04-debezium.md](./04-debezium.md) — producer for `dbz.gdfkube.*`.
- [06-camel.md](./06-camel.md) — main consumer + DLQ producer/consumer.
- [02-express-api.md](./02-express-api.md) — SSE consumer of `gdfkube.pipeline.status`.
