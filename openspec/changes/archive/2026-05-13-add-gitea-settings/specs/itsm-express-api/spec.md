## ADDED Requirements

### Requirement: Settings GET endpoint SHALL return the global Gitea configuration

The service SHALL expose `GET /api/itsm/settings` gated by `demoUser` and `requireAdmin` middleware. The endpoint MUST return the singleton Gitea settings document with fields `endpoint`, `owner`, `token`, `updatedAt`, and `updatedBy`. The `token` field MUST be redacted to `"***"` in the response unless the query string includes `reveal=1`, in which case the token MUST be returned in cleartext. Non-admin requests MUST receive `403 Forbidden`.

#### Scenario: Admin GET returns redacted token

- **GIVEN** the `gitea_settings` collection contains a singleton document with `token: 'real-token-value'`
- **AND** the request is from an admin user
- **WHEN** the admin issues `GET /api/itsm/settings`
- **THEN** the response SHALL be `200 OK`
- **AND** the response body SHALL include `endpoint`, `owner`, `updatedAt`, `updatedBy`
- **AND** the `token` field SHALL be `"***"`

#### Scenario: Admin GET with reveal=1 returns cleartext token

- **GIVEN** the `gitea_settings` collection contains a singleton document with `token: 'real-token-value'`
- **AND** the request is from an admin user
- **WHEN** the admin issues `GET /api/itsm/settings?reveal=1`
- **THEN** the response SHALL be `200 OK`
- **AND** the `token` field SHALL be `'real-token-value'`

#### Scenario: Non-admin GET returns 403

- **GIVEN** the request is from a non-admin user
- **WHEN** the user issues `GET /api/itsm/settings`
- **THEN** the response SHALL be `403 Forbidden`

---

### Requirement: Settings PATCH endpoint SHALL upsert the global Gitea configuration

The service SHALL expose `PATCH /api/itsm/settings` gated by `demoUser` and `requireAdmin` middleware. The endpoint MUST validate the request body and upsert the singleton document (`_id: 'gitea'`). On success, `updatedAt` MUST be set to the current time and `updatedBy` MUST be set to the requester's demo user id. The response MUST return the updated document with the `token` field redacted. Non-admin requests MUST receive `403 Forbidden`.

#### Scenario: Admin PATCH with valid body upserts and stamps audit fields

- **GIVEN** the request is from admin user `maria.costa`
- **WHEN** the admin issues `PATCH /api/itsm/settings` with body `{ "endpoint": "https://gitea.example.com", "owner": "myorg", "token": "new-pat" }`
- **THEN** the response SHALL be `200 OK`
- **AND** the singleton document SHALL have `endpoint: 'https://gitea.example.com'`, `owner: 'myorg'`, `token: 'new-pat'`
- **AND** `updatedAt` SHALL be set to approximately the current time
- **AND** `updatedBy` SHALL be `'maria.costa'`
- **AND** the response `token` field SHALL be `"***"`

#### Scenario: PATCH with invalid endpoint returns 400

- **GIVEN** the request is from an admin user
- **WHEN** the admin issues `PATCH /api/itsm/settings` with body `{ "endpoint": "not-a-url", "owner": "ok", "token": "ok" }`
- **THEN** the response SHALL be `400 Bad Request`
- **AND** the singleton document SHALL NOT be mutated

#### Scenario: PATCH with invalid owner returns 400

- **GIVEN** the request is from an admin user
- **WHEN** the admin issues `PATCH /api/itsm/settings` with body `{ "endpoint": "https://ok.com", "owner": "bad owner!!", "token": "ok" }`
- **THEN** the response SHALL be `400 Bad Request`
- **AND** the singleton document SHALL NOT be mutated

#### Scenario: PATCH with empty token returns 400

- **GIVEN** the request is from an admin user
- **WHEN** the admin issues `PATCH /api/itsm/settings` with body `{ "endpoint": "https://ok.com", "owner": "ok", "token": "" }`
- **THEN** the response SHALL be `400 Bad Request`
- **AND** the singleton document SHALL NOT be mutated

#### Scenario: Non-admin PATCH returns 403

- **GIVEN** the request is from a non-admin user
- **WHEN** the user issues `PATCH /api/itsm/settings`
- **THEN** the response SHALL be `403 Forbidden`

---

### Requirement: Settings router SHALL be mounted in the Express app

The Express app (`server/src/app.ts`) MUST mount the settings router at `/api/itsm/settings` using `app.use('/api/itsm/settings', settingsRouter)`, following the same registration pattern as the existing route files.

#### Scenario: Settings routes are reachable

- **GIVEN** the Express app has started
- **WHEN** a client issues a request to `/api/itsm/settings`
- **THEN** the request SHALL be routed to the settings router
