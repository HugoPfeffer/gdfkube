## MODIFIED Requirements

### Requirement: Topbar with breadcrumbs, search, role switcher

The portal MUST render a topbar containing a breadcrumb trail derived from the current route, a search input with a `⌘K` hint, a refresh icon-button, a notifications icon-button (with a pip indicator), and a role switcher menu showing the current user's initials, name, and `org · role` line. Clicking the role switcher MUST open a menu with exactly two options: `Operator` and `Platform Admin`; selecting one MUST update the active role.

When the active role changes, the `X-Demo-User` header value the API client will send on its next call MUST be updated synchronously (within the same React render that mutates `role`) so that no API call can carry a stale username. Implementations MUST NOT defer this header update to a `useEffect`.

#### Scenario: breadcrumbs reflect route

- **GIVEN** the current route is `request-detail` with `routeParams.id = "REQ0010247C"`
- **WHEN** the topbar renders for an `operator`
- **THEN** the breadcrumbs read `My requests / REQ0010247C`

#### Scenario: switching role updates topbar identity

- **GIVEN** the active role is `operator` and the user is `João Silva`
- **WHEN** the user opens the role menu and selects `Platform Admin`
- **THEN** the topbar avatar shows `MC`, the name updates to `Maria Costa`, and the org-role line reads `SETIC · Platform Admin`

#### Scenario: role switch synchronously updates demo-user header

- **GIVEN** the active role is `operator` (`X-Demo-User: joao.silva` is the next-call header)
- **WHEN** the user selects `Platform Admin` in the role menu
- **THEN** the next API call made anywhere in the app carries `X-Demo-User: maria.costa`
- **AND** there is no intermediate render in which a fetch could fire with the stale operator username

#### Scenario: role menu offers only operator and admin

- **WHEN** the role menu is opened
- **THEN** the visible options are exactly `Operator` and `Platform Admin`
- **AND** no `Approver` or `Service` options appear
