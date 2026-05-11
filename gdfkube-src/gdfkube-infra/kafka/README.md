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
