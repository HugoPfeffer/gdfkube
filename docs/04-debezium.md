# Debezium

> **Implementation Status:** Partially implemented
> **Source:** Handoff `app.jsx` (connector config, SMTs, snapshot mode)
> **Last validated:** 2026-05-14

## Specs

- [`debezium-connect-stack`](../openspec/specs/debezium-connect-stack/spec.md)

## Role in the Pipeline

```
[MongoDB rs0] ──oplog──▶ [Debezium MongoDB connector] ──change events──▶ [Kafka]
```

Debezium is the only thing tailing MongoDB. It turns inserts/updates into
flat JSON events on Kafka, with the document `_id` as the message key.

## Responsibilities

- Tail the `gdfkube` MongoDB oplog.
- Emit one Kafka event per insert (`op=c`) and update (`op=u`) on watched collections.
- Apply Single Message Transforms to flatten the Debezium envelope and route to per-collection topics.
- **Does NOT** write back to MongoDB, filter business logic (filtering happens in Camel), or dedupe events.

## Design

### Tech

- Debezium 2.x MongoDB source connector.
- Runs inside Strimzi Kafka Connect, deployed as a `KafkaConnector` CR (declarative Strimzi style).
- Lives in the `gdfkube-kafka` namespace alongside the Kafka cluster.

### Connector Configuration

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaConnector
metadata:
  name: gdfkube-mongo-source
  namespace: gdfkube-kafka
  labels:
    strimzi.io/cluster: gdfkube-connect
spec:
  class: io.debezium.connector.mongodb.MongoDbConnector
  tasksMax: 1
  config:
    mongodb.connection.string: "mongodb://gdfkube-mongo-0.gdfkube-mongo-svc:27017,gdfkube-mongo-1.gdfkube-mongo-svc:27017,gdfkube-mongo-2.gdfkube-mongo-svc:27017/?replicaSet=rs0"
    topic.prefix: "dbz.gdfkube"
    database.include.list: "gdfkube"
    collection.include.list: "gdfkube.requests,gdfkube.forms"
    snapshot.mode: "initial"
    capture.mode: "change_streams_update_full"
    signal.data.collection: "gdfkube.debezium_signals"

    # SMTs: unwrap envelope + route to per-collection topics
    transforms: "unwrap,route"
    transforms.unwrap.type: "io.debezium.connector.mongodb.transforms.ExtractNewDocumentState"
    transforms.unwrap.add.headers: "op,source.ts_ms"
    transforms.unwrap.delete.handling.mode: "rewrite"
    transforms.route.type: "org.apache.kafka.connect.transforms.RegexRouter"
    transforms.route.regex: "dbz\\.gdfkube\\.gdfkube\\.(.*)"
    transforms.route.replacement: "dbz.gdfkube.$1"

    # Serialization
    key.converter: "org.apache.kafka.connect.json.JsonConverter"
    key.converter.schemas.enable: "false"
    value.converter: "org.apache.kafka.connect.json.JsonConverter"
    value.converter.schemas.enable: "false"

    # Error handling — errors are tolerated and routed to a connector-level DLQ
    errors.tolerance: "all"
    errors.deadletterqueue.topic.name: "dlq.gdfkube.debezium"
    errors.deadletterqueue.context.headers.enable: "true"
    errors.deadletterqueue.topic.replication.factor: 3
```

### Topics Produced

| Topic | Source collection | Notes |
|---|---|---|
| `dbz.gdfkube.requests` | `gdfkube.requests` | Primary trigger for the pipeline. Key = ULID `_id`. |
| `dbz.gdfkube.forms` | `gdfkube.forms` | Form catalog changes. Powers `config-reload`. |
| `dlq.gdfkube.debezium` | (errors) | Connector-level DLQ for malformed events. |

Topic settings (partitions, retention) live in [05-kafka.md](./05-kafka.md).

### Event Shape (after SMTs)

```json
{
  "_id": "01HK6X3F5G9Q...",
  "formId": "cluster-request",
  "status": "provisioning",
  "vars": { ... },
  "meta": { ... },
  "__deleted": false
}
```

Headers carry: `op` (`c|u|d`), `source.ts_ms`.

### Snapshot Mode

`snapshot.mode = initial` — on first start, Debezium scans `requests` and
`forms` end to end and emits one `op=r` (read) event per document. Subsequent
restarts resume from the saved offset in the connect-offsets topic. This is
fine for the demo: snapshot run will be small and is idempotent downstream.

### Signals Collection

`signal.data.collection = gdfkube.debezium_signals` is configured for
completeness — it lets an operator trigger ad-hoc snapshots by inserting a
signal document. **Not used by the demo flows.** Created manually if/when
needed; absence does not break the connector.

## Interfaces

| Direction | Counterpart | Protocol |
|---|---|---|
| Inbound | MongoDB rs0 | TCP / change streams |
| Outbound | Kafka | producer to `dbz.gdfkube.*` |

## Operational Concerns

- **Oplog window:** if Debezium is offline longer than the oplog retention, the connector cannot resume from offset and will need a fresh snapshot. Size oplog ≥ retention of `dbz.gdfkube.*` topics.
- **Schema-less JSON** is intentional — keeps Camel deserialization simple, avoids a schema registry dependency.
- **Order:** Debezium guarantees per-`_id` ordering because all events for a key go to the same partition (key-based partitioning). Cross-document ordering is not guaranteed.
- **Replays:** because key = `requestId`, replays of `dbz.gdfkube.requests` are safe — Camel's downstream operations are idempotent.

## Decisions Resolved

- Snapshot mode: `initial`.
- `signal.data.collection` configured but not used by demo flows.
- Connector-level errors go to `dlq.gdfkube.debezium`. Per-route DLQs in Camel are separate.
- No schema registry. JSON converters with `schemas.enable=false`.
- Topic naming after SMT: `dbz.gdfkube.{collection}`.

## Open Questions

- TLS / SCRAM auth between connector and MongoDB? Assumed yes for production, not specified for demo.
- Connector resource limits (heap, CPU)? Not in handoff.
- Should `audit_log` be CDC-watched too? Currently no — audit is an output of the pipeline, not an input.

## References

- [03-mongodb.md](./03-mongodb.md) — collections, oplog requirement.
- [05-kafka.md](./05-kafka.md) — topic settings, retention, replication.
- [06-camel.md](./06-camel.md) — primary consumer of `dbz.gdfkube.requests`.
