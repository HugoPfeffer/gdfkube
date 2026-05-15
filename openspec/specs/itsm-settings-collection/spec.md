## ADDED Requirements

### Requirement: Gitea settings Mongoose model SHALL define a singleton schema

The file `server/src/models/GiteaSettings.ts` MUST define a Mongoose model for the `gitea_settings` collection with the following schema:

| Field | Type | Constraints |
|---|---|---|
| `_id` | String | Fixed value `'gitea'` |
| `endpoint` | String | Optional, match `^https?://.+$` |
| `owner` | String | Required, match `^[a-zA-Z0-9_-]+$` |
| `token` | String | Required |
| `updatedAt` | Date | Auto-managed |
| `updatedBy` | String | Auto-managed |

The collection name MUST follow the existing snake_case convention used by other models in `server/src/models/`.

#### Scenario: Model enforces endpoint validation

- **GIVEN** a document with `endpoint: 'not-a-url'`
- **WHEN** the document is validated
- **THEN** Mongoose SHALL reject it with a validation error

#### Scenario: Model enforces owner validation

- **GIVEN** a document with `owner: 'bad owner!!'`
- **WHEN** the document is validated
- **THEN** Mongoose SHALL reject it with a validation error

#### Scenario: Model requires token

- **GIVEN** a document with `token: ''` or missing `token`
- **WHEN** the document is validated
- **THEN** Mongoose SHALL reject it with a validation error

---

### Requirement: Seed data SHALL match project-default Gitea values

The seed data for the `gitea_settings` collection MUST contain exactly one document, omitting the `endpoint` field (owned by `gitea-token-sync` at runtime):

```json
{
  "_id": "gitea",
  "owner": "gdfkube",
  "token": "CHANGE_ME",
  "updatedBy": "seed"
}
```

The `owner` value MUST match `giteaOwner` in `gdfkube-infra/charts/cluster-request/values.yaml`. The `token` value MUST be a clearly non-real placeholder (`CHANGE_ME`) with a `trufflehog:ignore` comment in the TypeScript source. The seed MUST NOT include an `endpoint` field — `gitea-token-sync` is the sole writer of `gitea_settings.endpoint`.

#### Scenario: Seed values match Helm values

- **GIVEN** the seed data for `gitea_settings`
- **WHEN** compared against `values.yaml`
- **THEN** `owner` SHALL equal `giteaOwner` from `values.yaml`
- **AND** the seed document SHALL NOT contain an `endpoint` field

#### Scenario: Token is a placeholder

- **GIVEN** the seed data for `gitea_settings`
- **WHEN** the `token` field is inspected
- **THEN** the value SHALL be `'CHANGE_ME'`

---

### Requirement: Seed on empty DB SHALL create the singleton document

When `seed-collections.js` runs against an empty database, the `gitea_settings` collection MUST contain exactly one document with `_id: 'gitea'`, the project-default `owner`, the placeholder `token`, and `updatedBy: 'seed'`. The seeder MUST NOT write an `endpoint` field; `gitea-token-sync` upserts it at runtime.

#### Scenario: Fresh seed creates the document

- **GIVEN** the `gitea_settings` collection does not exist or is empty
- **WHEN** `seed-collections.js` executes
- **THEN** the collection SHALL contain exactly one document
- **AND** `_id` SHALL be `'gitea'`
- **AND** `owner` SHALL be `'gdfkube'`
- **AND** `token` SHALL be `'CHANGE_ME'`
- **AND** the document SHALL NOT contain an `endpoint` field

#### Scenario: Fresh seed followed by gitea-token-sync yields the canonical endpoint

- **GIVEN** the `gitea_settings` collection has been freshly seeded
- **WHEN** `gitea-token-sync` runs successfully
- **THEN** the singleton document SHALL contain `endpoint: 'http://gitea:3000'`
- **AND** `owner` SHALL equal `process.env.GITEA_ORG`
- **AND** `token` SHALL be a non-placeholder value

---

### Requirement: Seed export SHALL produce settings.json

When `npm run seed:export` (or `scripts/export-seed-data.mjs`) runs, it MUST produce a file at `gdfkube-infra/mongodb/seed-data/settings.json` containing the singleton Gitea settings document matching the seeded shape. The exported document MUST omit any field not present in the seed source-of-truth — in particular `endpoint`, `updatedAt`, and any token regenerated at runtime.

#### Scenario: Export generates settings.json without runtime fields

- **GIVEN** the export script runs against a database where `gitea-token-sync` has already populated `endpoint` and a live token
- **WHEN** execution completes
- **THEN** `gdfkube-infra/mongodb/seed-data/settings.json` SHALL exist
- **AND** the file SHALL contain a JSON document with `_id: 'gitea'`, `owner`, `token: 'CHANGE_ME'`, and `updatedBy: 'seed'`
- **AND** the file SHALL NOT contain an `endpoint` field
- **AND** the file SHALL NOT contain an `updatedAt` field
