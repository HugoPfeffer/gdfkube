## ADDED Requirements

### Requirement: Requests Document Shape

The `gdfkube.requests` collection SHALL store one document per ITSM request with a string `_id` and the shape declared in `docs/03-mongodb.md:55-83`. The `_id` SHALL be one of two recognized formats: (a) legacy ULID (`^[0-9A-HJKMNP-TV-Z]{26}$`) for documents created before this change, and (b) the canonical REQ-pattern `^REQ\d{7}[CNSX]$` (REQ + 7-digit counter + form-type letter) for new documents and all seeded fixtures.

Both formats SHALL coexist in the collection. The schema SHALL NOT enforce a regex validator on `_id`; it remains a plain `String` to preserve compatibility with existing rows.

#### Scenario: New request has REQ-pattern _id

- **GIVEN** a request created via `POST /api/itsm/requests` for the cluster-request form
- **WHEN** the document is fetched from Mongo
- **THEN** `_id` matches `^REQ\d{7}C$`

#### Scenario: Seeded ids carry the form-type letter

- **GIVEN** the seed script imports `REQUESTS` from `src/data/seeds.ts`
- **WHEN** the seed script upserts a cluster-request fixture with id `REQ0010247C`
- **THEN** the resulting document has `_id === 'REQ0010247C'`

#### Scenario: Legacy ULID rows remain readable

- **GIVEN** a pre-existing document with `_id` `01HQ3K5M7N8PABCDEFGHJKMNPQ`
- **WHEN** any route calls `findById('01HQ3K5M7N8PABCDEFGHJKMNPQ')`
- **THEN** the lookup succeeds and returns the document unchanged

#### Scenario: Required fields enforced by Mongoose

- **WHEN** any code path attempts to save a Request without `formId`, `env`, `status`, `stage`, `submittedAt`, `requester`, `requesterGroupName`, `vars`, `meta`, or `policyChecks`
- **THEN** Mongoose rejects the save with a validation error

#### Scenario: Status enum

- **WHEN** any code path sets `status` outside `{ approval, provisioning, ready, failed }`
- **THEN** Mongoose rejects the save with a validation error

#### Scenario: Stage range and monotonic progression

- **WHEN** any code path sets `stage` outside the integer range 0..6
- **THEN** Mongoose rejects the save with a validation error
- **AND** Camel route stage writes MUST use `$max` (never `$set`) so concurrent or out-of-order events cannot decrement `stage`

#### Scenario: env enum

- **WHEN** any code path sets `env` outside `{ production, staging, development }`
- **THEN** Mongoose rejects the save with a validation error

#### Scenario: meta.correlationId equals _id for new requests

- **GIVEN** a request created via `POST /api/itsm/requests`
- **WHEN** the document is fetched from Mongo
- **THEN** `meta.correlationId === _id`

#### Scenario: reason defaults to null

- **WHEN** a Request is created without an explicit `reason`
- **THEN** the persisted document's `reason` field equals `null`

---

### Requirement: Approval Chain Atomicity

Status, stage, and `approvalChain` mutations on a Request SHALL be applied in a single `findByIdAndUpdate` so that `change_streams_update_full` post-images are always consistent.

#### Scenario: Approve uses single update

- **WHEN** `requestService.decide({ id, body: { action: 'approved' } })` runs
- **THEN** Mongo records exactly one update operation containing both `$push:{approvalChain}` and `$set:{status,stage}`
- **AND** the resulting change-stream event carries a post-image with consistent `status`, `stage`, and the new `approvalChain` entry

#### Scenario: Reject uses single update with reason

- **WHEN** `requestService.decide` runs with `action: 'rejected'`
- **THEN** the single update contains `$push:{approvalChain}` plus `$set:{status:'failed', reason:<comment>}`

#### Scenario: requested_changes only pushes

- **WHEN** `requestService.decide` runs with `action: 'requested_changes'`
- **THEN** the single update contains only `$push:{approvalChain}` (no `$set` on status/stage)

---

### Requirement: Requests Indexes

The `gdfkube.requests` collection SHALL have the indexes declared in `docs/03-mongodb.md:138-145`, created idempotently by the seed script.

#### Scenario: Required indexes exist after seed

- **GIVEN** the seed script has run at least once
- **WHEN** the test issues `db.requests.getIndexes()`
- **THEN** the result includes `idx_formId_status` (`{ formId: 1, status: 1 }`), `idx_org_env` (`{ requesterGroupName: 1, env: 1 }`), `idx_status` (`{ status: 1 }`), `idx_createdAt` (`{ submittedAt: 1 }`), and `idx_correlationId` (`{ 'meta.correlationId': 1 }`)

#### Scenario: Re-running the seed is idempotent

- **WHEN** the seed script runs a second time on the same data
- **THEN** no duplicate indexes are created and `bulkWrite.upsertedCount` is 0

---

### Requirement: Requests Collection in CDC Include List

The `gdfkube.requests` collection SHALL be included in Debezium's `collection.include.list` (`gdfkube.requests,gdfkube.forms`), so this change does not modify CDC config but guarantees the documented shape on day one of the Debezium spec.

#### Scenario: Document shape matches docs/03-mongodb.md verbatim

- **GIVEN** a sampled Request document from the seeded collection or any newly-created request
- **WHEN** its top-level keys are compared against `docs/03-mongodb.md:55-83`
- **THEN** every documented key is present with the documented type, and no undocumented top-level keys are added that would surprise Debezium consumers

#### Scenario: change_streams_update_full will see full post-images

- **WHEN** the next (Debezium) spec configures `capture.mode: change_streams_update_full`
- **THEN** every Request mutation produced by this service emits a post-image consistent with the document shape (verified by the atomic-update Requirement above)
