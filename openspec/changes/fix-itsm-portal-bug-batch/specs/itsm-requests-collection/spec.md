## MODIFIED Requirements

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
