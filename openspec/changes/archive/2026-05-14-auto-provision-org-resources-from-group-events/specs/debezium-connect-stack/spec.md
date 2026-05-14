## MODIFIED Requirements

### Requirement: Connector SHALL emit CDC events from gdfkube.requests, gdfkube.forms, and gdfkube.groups

After successful registration, the connector MUST publish change events from `gdfkube.requests` to topic `dbz.gdfkube.requests`, from `gdfkube.forms` to topic `dbz.gdfkube.forms`, and from `gdfkube.groups` to topic `dbz.gdfkube.groups`. Events MUST include the `op`, `source.ts_ms`, and (for `op=u`) `before`/`after` document images. The MongoDB collections `gdfkube.requests`, `gdfkube.forms`, and `gdfkube.groups` MUST all be created with `changeStreamPreAndPostImages: true`. Connector-level errors MUST land on `dlq.gdfkube.debezium` with `context.headers` populated.

The connector configuration's `collection.include.list` MUST be `gdfkube.requests,gdfkube.forms,gdfkube.groups`. The existing `unwrap` + `reroute` SMTs apply to `gdfkube.groups` unchanged: the unwrapped message body is the group document directly (`_id`, `name`, `fullName`, `repo`, `clusters`, `users`, `forms`), with header `__op` ∈ `{c, r, u, d}`.

#### Scenario: Snapshot replay on cold start

- **GIVEN** the MongoDB `gdfkube.requests` collection contains seeded documents
- **AND** the stack is brought up from a clean state (`docker compose down -v` then `up -d`)
- **WHEN** the connector finishes its initial snapshot
- **THEN** each seeded document SHALL produce a corresponding `op=r` event on `dbz.gdfkube.requests`
- **AND** the event payload SHALL include the full document under `after`

#### Scenario: Live change emits op=c

- **GIVEN** the connector is RUNNING with a completed snapshot
- **WHEN** a new document is inserted into `gdfkube.requests` via the Express API
- **THEN** an `op=c` event SHALL appear on `dbz.gdfkube.requests` keyed by the document's `_id`
- **AND** the event payload SHALL include the full document under `after`

#### Scenario: Update emits op=u with before/after pre-image

- **GIVEN** the connector is RUNNING
- **AND** `gdfkube.requests` was created with `changeStreamPreAndPostImages: true`
- **WHEN** an existing document's `status` field is updated from `approval` to `provisioning`
- **THEN** an `op=u` event SHALL appear on `dbz.gdfkube.requests`
- **AND** the event payload SHALL include `before.status == "approval"` and `after.status == "provisioning"`

#### Scenario: Group create emits op=c on dbz.gdfkube.groups

- **GIVEN** the connector is RUNNING
- **AND** `gdfkube.groups` was created with `changeStreamPreAndPostImages: true`
- **WHEN** a new document is inserted into `gdfkube.groups` via the Express API (e.g., `_id: "cultura"`, `repo: "gdfkube-cultura"`)
- **THEN** an `op=c` event SHALL appear on `dbz.gdfkube.groups` keyed by `cultura`
- **AND** the event payload SHALL include the full group document under `after`

#### Scenario: Group snapshot replay emits op=r on dbz.gdfkube.groups

- **GIVEN** the MongoDB `gdfkube.groups` collection contains pre-existing documents
- **AND** the stack is brought up from a clean state with the updated `collection.include.list`
- **WHEN** the connector finishes its initial snapshot
- **THEN** each existing group document SHALL produce a corresponding `op=r` event on `dbz.gdfkube.groups`

#### Scenario: Malformed event lands on the connector DLQ

- **GIVEN** the connector is RUNNING
- **WHEN** a connector-level processing error occurs (e.g., schema conversion failure)
- **THEN** the offending message SHALL be produced to `dlq.gdfkube.debezium`
- **AND** the message SHALL carry context headers describing the original topic, partition, offset, and error class

---

## RENAMED Requirements

- FROM: `### Requirement: Connector SHALL emit CDC events from gdfkube.requests and gdfkube.forms`
- TO: `### Requirement: Connector SHALL emit CDC events from gdfkube.requests, gdfkube.forms, and gdfkube.groups`
