## ADDED Requirements

### Requirement: Settings PATCH SHALL reject malformed bodies before destructuring

The `PATCH /api/itsm/settings` handler MUST guard against `null`, non-object, and array request bodies before attempting to destructure `endpoint`, `owner`, and `token`. If `req.body` is not a plain object, the handler MUST return `400 Bad Request` with body `{ "error": "invalid body" }` and MUST NOT mutate the singleton document. This requirement is in addition to the field-level validations already enforced by the Settings PATCH endpoint requirement.

#### Scenario: Null body returns 400

- **GIVEN** the request is from an admin user
- **WHEN** the admin issues `PATCH /api/itsm/settings` with a JSON `null` body
- **THEN** the response SHALL be `400 Bad Request`
- **AND** the response body SHALL be `{ "error": "invalid body" }`
- **AND** the singleton document SHALL NOT be mutated

#### Scenario: Array body returns 400

- **GIVEN** the request is from an admin user
- **WHEN** the admin issues `PATCH /api/itsm/settings` with body `[]`
- **THEN** the response SHALL be `400 Bad Request`
- **AND** the singleton document SHALL NOT be mutated

#### Scenario: Non-object scalar body returns 400

- **GIVEN** the request is from an admin user
- **WHEN** the admin issues `PATCH /api/itsm/settings` with body `"a string"`
- **THEN** the response SHALL be `400 Bad Request`
- **AND** the singleton document SHALL NOT be mutated

---

### Requirement: Settings GET with reveal=1 SHALL emit Cache-Control no-store

When `GET /api/itsm/settings` receives the query parameter `reveal=1` (causing the response to include the plaintext token), the handler MUST set the response header `Cache-Control: no-store` before sending the JSON body. This prevents browsers, reverse proxies, and CDNs from caching the plaintext PAT.

#### Scenario: Reveal response carries no-store header

- **GIVEN** the request is from an admin user
- **AND** the `gitea_settings` singleton exists with a plaintext `token`
- **WHEN** the admin issues `GET /api/itsm/settings?reveal=1`
- **THEN** the response SHALL be `200 OK`
- **AND** the response `Cache-Control` header SHALL be `no-store`
- **AND** the response `token` field SHALL be the plaintext value

#### Scenario: Redacted GET does not require no-store

- **GIVEN** the request is from an admin user
- **WHEN** the admin issues `GET /api/itsm/settings` (no `reveal` parameter)
- **THEN** the response `token` field SHALL be `"***"`
- **AND** the response MAY omit the `Cache-Control: no-store` header

---

### Requirement: OpenAPI spec SHALL document the Settings endpoints

The file `gdfkube-src/gdfkube-itsm/server/src/openapi.yaml` MUST document both Settings endpoints under the existing `paths` section, mirroring the conventions already used for `/api/itsm/users` and `/api/itsm/groups`:

1. `GET /api/itsm/settings` with an optional `reveal` query parameter (boolean, defaults to redacted) and responses for `200`, `403`, and `404`.
2. `PATCH /api/itsm/settings` with a request body schema declaring `endpoint` (string, matches `^https?://.+$`), `owner` (string, matches `^[a-zA-Z0-9_-]+$`), and `token` (string, non-empty), and responses for `200`, `400`, and `403`.

The existing OpenAPI contract test at `gdfkube-src/gdfkube-itsm/server/__tests__/openapi.test.ts` MUST pass after these additions.

#### Scenario: GET /api/itsm/settings is in the OpenAPI spec

- **WHEN** `openapi.yaml` is parsed
- **THEN** the document SHALL contain `paths['/api/itsm/settings'].get`
- **AND** the operation SHALL declare a `reveal` query parameter
- **AND** the operation SHALL declare `200`, `403`, and `404` responses

#### Scenario: PATCH /api/itsm/settings is in the OpenAPI spec

- **WHEN** `openapi.yaml` is parsed
- **THEN** the document SHALL contain `paths['/api/itsm/settings'].patch`
- **AND** the operation SHALL declare a request body schema with `endpoint`, `owner`, and `token` properties
- **AND** the operation SHALL declare `200`, `400`, and `403` responses

#### Scenario: OpenAPI contract test passes

- **WHEN** `npm test --workspace gdfkube-src/gdfkube-itsm/server -- __tests__/openapi.test.ts` is run
- **THEN** the test SHALL pass with no missing-route or schema-mismatch failures for the Settings paths
