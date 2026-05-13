## MODIFIED Requirements

### Requirement: Users Document Shape

The `gdfkube.users` collection SHALL store one document per ITSM demo user with a string `_id` equal to the username (e.g. `joao.silva`) and the shape mirroring `gdfkube-src/gdfkube-itsm/src/types.ts:5-17`. The `role` field SHALL be one of exactly `{ operator, admin }` — the previous `approver` and `service` values are removed.

#### Scenario: Required fields enforced by Mongoose

- **WHEN** any code path attempts to save a User without `_id`, `name`, `email`, or `role`
- **THEN** Mongoose rejects the save with a validation error

#### Scenario: Role enum is operator or admin

- **WHEN** `role` is set outside `{ operator, admin }`
- **THEN** Mongoose rejects the save

#### Scenario: Optional fields are accepted

- **WHEN** a User is saved with `fullName`, `group`, `status`, `mfa`, or `last`
- **THEN** the save succeeds and those fields round-trip through Mongoose

#### Scenario: _id is the username

- **GIVEN** a seeded User with id `joao.silva`
- **WHEN** the document is fetched
- **THEN** `_id === 'joao.silva'` (no ObjectId, no separate username field)
