## ADDED Requirements

### Requirement: dlq_log collection SHALL exist in the gdfkube database with the defined schema

The MongoDB database `gdfkube` MUST contain a collection named `dlq_log`. Each document MUST conform to this shape:

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | yes | MongoDB default |
| `topic` | string | yes | The DLQ topic the message was consumed from (e.g., `dlq.gdfkube.helm-render`) |
| `requestId` | string | yes | The originating `Request._id` extracted from `x-original-key` |
| `headers` | object | yes | The 9 mandatory context headers (per `kafka-broker-stack`) |
| `payload` | object | yes | The original Kafka message value (parsed as JSON when possible; otherwise stored as base64 string) |
| `firstSeenAt` | Date | yes | UTC timestamp when `dlq-handler` first observed the message |
| `replayCount` | integer | yes | Default `0`; incremented by future manual-replay tooling |
| `lastReplayAt` | Date | no | UTC timestamp of the most recent replay (set by future tooling) |

#### Scenario: Collection exists after init-camel-collections.js runs

- **GIVEN** the mongo replica set is healthy and `mongo-collections-init` has exited 0
- **WHEN** `mongosh` queries `db.getCollectionNames()` against the `gdfkube` database
- **THEN** the result SHALL include `"dlq_log"`

#### Scenario: Insert with the documented schema succeeds

- **GIVEN** the collection exists
- **WHEN** a document with `{topic, requestId, headers, payload, firstSeenAt, replayCount}` is inserted
- **THEN** the insert SHALL succeed
- **AND** the document SHALL be retrievable via `db.dlq_log.findOne({requestId})`

---

### Requirement: dlq_log SHALL have indexes for topic-time and per-request queries

The collection MUST have:

- A compound index `{ topic: 1, firstSeenAt: -1 }` for the operator query "list newest failures per topic".
- A single-field index `{ requestId: 1 }` for the query "did this request fail anywhere?".

#### Scenario: Both indexes are present

- **GIVEN** the collection exists
- **WHEN** `db.dlq_log.getIndexes()` is queried
- **THEN** the result SHALL contain an index keyed by `{ topic: 1, firstSeenAt: -1 }`
- **AND** the result SHALL contain an index keyed by `{ requestId: 1 }`

#### Scenario: Topic-time query uses the compound index

- **GIVEN** the collection contains DLQ rows from multiple topics
- **WHEN** `db.dlq_log.find({topic: "dlq.gdfkube.helm-render"}).sort({firstSeenAt: -1}).explain()` is run
- **THEN** the winning plan SHALL be `IXSCAN` over `{ topic: 1, firstSeenAt: -1 }`

---

### Requirement: dlq_log SHALL NOT have a TTL index

The collection MUST NOT have any TTL index. DLQ retention is operator-controlled: rows persist until manually replayed or deleted. This is the explicit contract with future operator-tooling specs.

#### Scenario: No TTL index is present

- **GIVEN** the collection exists
- **WHEN** `db.dlq_log.getIndexes()` is queried
- **THEN** no index in the result SHALL contain an `expireAfterSeconds` property

---

### Requirement: dlq_log SHALL be bootstrapped idempotently by init-camel-collections.js

`gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js` MUST create the `dlq_log` collection and its 2 indexes idempotently. The same `mongo-collections-init` Compose service used by `gdfkube-audit-log-collection` MUST bootstrap this collection in the same script run.

#### Scenario: First run creates the collection and indexes

- **GIVEN** a fresh stack
- **WHEN** `mongo-collections-init` runs
- **THEN** the service SHALL exit with code 0
- **AND** `db.dlq_log` SHALL exist with both indexes and NO TTL index

#### Scenario: Re-running the init is a no-op

- **GIVEN** the collection and indexes already exist
- **WHEN** `docker compose run --rm mongo-collections-init` is run
- **THEN** the run SHALL exit with code 0
- **AND** `db.dlq_log.getIndexes()` output SHALL be identical before and after the re-run

---

### Requirement: dlq_log writes SHALL come exclusively from the Camel dlq-handler route

The `dlq-handler` route in `camel-orchestrator-stack` MUST be the sole writer to `dlq_log` in the runtime. Manual-replay tooling (out of scope for this change) is allowed to update `replayCount` and `lastReplayAt` but MUST NOT replace the original `payload` or `headers` fields.

#### Scenario: dlq_log content reflects only DLQ-handler writes

- **GIVEN** Camel routes have published to one or more `dlq.gdfkube.*` topics
- **AND** dlq-handler has consumed those messages
- **WHEN** `dlq_log` documents are inspected
- **THEN** every document's `topic` field SHALL begin with `dlq.gdfkube.`
- **AND** every document SHALL contain the 9 mandatory DLQ headers
