## MODIFIED Requirements

### Requirement: Demo Identity Middleware

The service SHALL extract a demo user from the `X-Demo-User` request header against a static user list (`server/src/data/demoUsers.ts`), and SHALL reject any request to `/api/itsm/*` whose header is missing or unknown. The static user list is the single source of truth for demo identity; the role enum is exactly `'operator' | 'admin'`. No other identity headers (Authorization, cookies, JWT) are honored — `X-Demo-User` is the only wire.

#### Scenario: Missing header on /api/itsm route

- **GIVEN** a request to any `/api/itsm/*` path
- **WHEN** the request omits the `X-Demo-User` header
- **THEN** the service responds `401 Unauthorized` with body `{ "error": "X-Demo-User required" }`

#### Scenario: Unknown user

- **GIVEN** a request with `X-Demo-User: ghost.user`
- **WHEN** `ghost.user` is not in the static demo user list
- **THEN** the service responds `401 Unauthorized` with body `{ "error": "unknown demo user" }`

#### Scenario: Known user populates req.demoUser

- **GIVEN** a request with `X-Demo-User: joao.silva`
- **WHEN** the demo user list contains `joao.silva` with `{ id, name, email, role, group }` and `role` is `'operator'`
- **THEN** the middleware populates `req.demoUser` with the matched record and forwards the request to the next handler

#### Scenario: Role enum is exactly operator or admin

- **WHEN** the demo user list is loaded at startup
- **THEN** every entry's `role` is either `'operator'` or `'admin'`
- **AND** there is no entry with role `'approver'` or `'service'`

### Requirement: Admin Gate Middleware

The service SHALL gate every admin write route (POST/PATCH on `/forms`, `/users`, `/groups`, `/settings`, plus `POST /requests/:id/approvals`) AND `GET /settings` behind a middleware that checks `req.demoUser.role === 'admin'`.

#### Scenario: Non-admin role on admin route

- **GIVEN** a request with `X-Demo-User: joao.silva` (role `operator`)
- **WHEN** the request targets any admin write route OR `GET /api/itsm/settings`
- **THEN** the service responds `403 Forbidden` with body `{ "error": "admin role required" }`

#### Scenario: Admin role passes the gate

- **GIVEN** a request with `X-Demo-User: maria.costa` (role `admin`)
- **WHEN** the request targets any admin write route OR `GET /api/itsm/settings`
- **THEN** the gate forwards the request to the route handler

## REMOVED Requirements

### Requirement: approver role is not authorized for approvals

**Reason**: The `approver` and `service` roles are removed from `DEMO_USERS` because the UI only exposes `operator` and `admin`; the extra roles were unreachable placeholders inherited from the design-reference mock. Approvals are admin-only and the role enum is now binary.

**Migration**: Existing seed/fixture data referencing `lucia.fernandes` (approver) or `platform.bot` (service) MUST be removed. Any test that asserts a 403 for the approver role MUST be deleted (the case is now indistinguishable from "unknown user" → 401).
