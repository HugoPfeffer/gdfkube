## ADDED Requirements

### Requirement: audit_log collection SHALL exist in the gdfkube database with the defined schema

The MongoDB database `gdfkube` (already established by `mongodb-replica-set-stack`) MUST contain a collection named `audit_log`. Each document MUST conform to this shape:

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | yes | MongoDB default |
| `requestId` | string | yes | ULID matching the originating `Request._id` |
| `stage` | integer 0–6 | yes | The stage index at which the audited action occurred |
| `actor` | string | yes | `gdfkube-camel/<routeName>` (e.g., `gdfkube-camel/helm-render`) |
| `verb` | string | yes | One of `render`, `commit`, `push`, `create-repo`, `emit-status` |
| `detail` | object | no | Free-form structured detail (e.g., `{ chartRef, commitSha }`) |
| `at` | Date (BSON Date) | yes | UTC timestamp of the audit event |

#### Scenario: Collection exists after init-camel-collections.js runs

- **GIVEN** the mongo replica set is healthy and `mongo-collections-init` has exited 0
- **WHEN** `mongosh` queries `db.getCollectionNames()` against the `gdfkube` database
- **THEN** the result SHALL include `"audit_log"`

#### Scenario: Insert with the documented schema succeeds

- **GIVEN** the collection exists
- **WHEN** a document with `{requestId, stage, actor, verb, at}` is inserted
- **THEN** the insert SHALL succeed
- **AND** the document SHALL be retrievable via `db.audit_log.findOne({requestId})`

---

### Requirement: audit_log SHALL have a 30-day TTL on the at field

The collection MUST have a TTL index on `{ at: 1 }` with `expireAfterSeconds: 2592000` (30 days). MongoDB's TTL monitor MUST remove documents whose `at` timestamp is older than 30 days.

#### Scenario: TTL index is present with the correct expiry

- **GIVEN** the collection exists
- **WHEN** `db.audit_log.getIndexes()` is queried
- **THEN** the result SHALL contain an index on `{ at: 1 }` with `expireAfterSeconds == 2592000`

---

### Requirement: audit_log SHALL have a compound index for per-request time-ordered queries

The collection MUST have a compound index on `{ requestId: 1, at: -1 }` to support the common access pattern "list all audit rows for a request, newest first".

#### Scenario: Compound index is present

- **GIVEN** the collection exists
- **WHEN** `db.audit_log.getIndexes()` is queried
- **THEN** the result SHALL contain an index keyed by `{ requestId: 1, at: -1 }`

#### Scenario: Per-request query uses the index

- **GIVEN** the collection has audit rows for multiple requests
- **WHEN** `db.audit_log.find({requestId: "<X>"}).sort({at: -1}).explain()` is run
- **THEN** the winning plan SHALL be `IXSCAN` over `{ requestId: 1, at: -1 }`

---

### Requirement: audit_log SHALL be bootstrapped idempotently by init-camel-collections.js

A new script `gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js` MUST create the `audit_log` collection and indexes idempotently. The script MUST run in a new Compose service `mongo-collections-init` with `restart: "no"` and `depends_on` `mongo1: service_healthy`. The script MUST be safe to re-run: existing collections and indexes MUST NOT trigger errors.

#### Scenario: First run creates the collection and indexes

- **GIVEN** a fresh stack (`docker compose down -v` then `up -d`)
- **WHEN** `mongo-collections-init` runs
- **THEN** the service SHALL exit with code 0
- **AND** `db.audit_log` SHALL exist with the TTL index and compound index

#### Scenario: Re-running the init service is a no-op

- **GIVEN** the collection and indexes already exist
- **WHEN** `docker compose run --rm mongo-collections-init` is run
- **THEN** the run SHALL exit with code 0
- **AND** no error SHALL be logged
- **AND** `db.audit_log.getIndexes()` output SHALL be identical before and after the re-run

---

### Requirement: audit_log ownership SHALL be exclusive to the Camel audit-sink route

The `gdfkube.audit` topic MUST be the sole write path into `audit_log`. No other service or route may write to `audit_log` directly. The `audit-sink` route in `camel-orchestrator-stack` is the sole consumer of `gdfkube.audit` writing into this collection.

#### Scenario: audit_log writers are exclusively Camel audit-sink

- **GIVEN** the full stack is running
- **WHEN** `audit_log` documents are inspected
- **THEN** every document's `actor` field SHALL begin with the prefix `gdfkube-camel/`
