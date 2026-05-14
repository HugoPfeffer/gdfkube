## MODIFIED Requirements

### Requirement: Demo Identity Middleware

The service SHALL extract a demo user from the `X-Demo-User` request header against a static user list (`server/src/data/demoUsers.ts`), and SHALL reject any request to `/api/itsm/*` whose header is missing or unknown. The static user list is the single source of truth for demo identity; the role enum is exactly `'operator' | 'admin'`. No other identity headers (Authorization, cookies, JWT) are honored — `X-Demo-User` is the only wire for identity.

The middleware SHALL additionally read an optional `X-Demo-Role` header. When the header value is exactly `'operator'` or `'admin'`, the middleware SHALL attach to `req.demoUser` a **cloned** `DemoUser` record (a shallow copy of the matched entry from `DEMO_USERS`) with `.role` overridden to the header value. The middleware SHALL NEVER mutate the entry in `DEMO_USERS`. When `X-Demo-Role` is absent, empty, or set to any value other than `'operator'` or `'admin'`, the middleware SHALL attach the matched `DemoUser` with its stored role unchanged (the request SHALL NOT be rejected solely because of an invalid `X-Demo-Role` value).

#### Scenario: Missing header on /api/itsm route

- **GIVEN** a request to any `/api/itsm/*` path
- **WHEN** the request omits the `X-Demo-User` header
- **THEN** the service responds `401 Unauthorized` with body `{ "error": "X-Demo-User required" }`

#### Scenario: Unknown user

- **GIVEN** a request with `X-Demo-User: ghost.user`
- **WHEN** `ghost.user` is not in the static demo user list
- **THEN** the service responds `401 Unauthorized` with body `{ "error": "unknown demo user" }`

#### Scenario: Known user populates req.demoUser

- **GIVEN** a request with `X-Demo-User: joao.silva` and no `X-Demo-Role` header
- **WHEN** the demo user list contains `joao.silva` with `{ id, name, email, role, group }` and `role` is `'operator'`
- **THEN** the middleware populates `req.demoUser` with a copy of the matched record (role `'operator'`) and forwards the request to the next handler
- **AND** the entry in `DEMO_USERS` for `joao.silva` is not mutated

#### Scenario: Role enum is exactly operator or admin

- **WHEN** the demo user list is loaded at startup
- **THEN** every entry's `role` is either `'operator'` or `'admin'`
- **AND** there is no entry with role `'approver'` or `'service'`

#### Scenario: Valid X-Demo-Role overrides the stored role for the current request

- **GIVEN** a request with `X-Demo-User: ana.pereira` (stored role `'operator'`) and `X-Demo-Role: admin`
- **WHEN** the middleware runs
- **THEN** `req.demoUser.role` SHALL be `'admin'`
- **AND** `req.demoUser` SHALL NOT be the same object reference as `DEMO_USERS['ana.pereira']`
- **AND** the entry in `DEMO_USERS` for `ana.pereira` SHALL remain `role: 'operator'`

#### Scenario: Invalid X-Demo-Role falls through to the stored role

- **GIVEN** a request with `X-Demo-User: ana.pereira` (stored role `'operator'`) and `X-Demo-Role: bogus`
- **WHEN** the middleware runs
- **THEN** `req.demoUser.role` SHALL be `'operator'`
- **AND** the request SHALL be forwarded to the next handler (not rejected)

#### Scenario: Override interacts correctly with the admin gate

- **GIVEN** a request to `GET /api/itsm/users` (admin-gated) with `X-Demo-User: ana.pereira` (stored role `'operator'`) and `X-Demo-Role: admin`
- **WHEN** the middleware chain runs
- **THEN** the admin gate SHALL allow the request (because `req.demoUser.role === 'admin'`)
- **AND** the service SHALL respond `200 OK`

#### Scenario: Override on operator perspective for an admin user is gated correctly

- **GIVEN** a request to `GET /api/itsm/users` with `X-Demo-User: maria.costa` (stored role `'admin'`) and `X-Demo-Role: operator`
- **WHEN** the middleware chain runs
- **THEN** `req.demoUser.role` SHALL be `'operator'`
- **AND** the admin gate SHALL respond `403 Forbidden`
