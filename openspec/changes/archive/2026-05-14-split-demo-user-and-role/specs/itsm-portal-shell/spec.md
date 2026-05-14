## ADDED Requirements

### Requirement: Switch user picker in topbar dropdown

The topbar dropdown MUST render a "Switch user" section above the existing "Switch role" section. The Switch user section MUST list every active demo user sourced from `DataContext.users` (i.e. `useGdfData().users`, populated by `Bootstrap` from `GET /api/itsm/users`). Each list item MUST display the user's `name` (or `fullName`) and a secondary line containing `@ {group}`. Users whose `status === 'disabled'` (or `active === false`) MUST NOT appear in the list. The currently active user MUST be marked with a visible checkmark. Selecting a list item MUST update the active username via the `setUser` callback passed to the topbar AND close the dropdown. The Switch user selection MUST NOT change the active role; the existing role MUST be preserved across user changes.

Because the topbar consumes `DataContext.users`, creating, editing, or disabling a user via the admin Users tab (`src/admin/UserEditor.tsx`, `src/admin/NewUserPage.tsx`) MUST cause the Switch user list to update on the next render, without a page reload.

#### Scenario: Switch user section appears above Switch role

- **GIVEN** an authenticated session with at least two demo users in `DataContext.users`
- **WHEN** the user opens the topbar dropdown
- **THEN** a section header `Switch user` appears above the `Switch role` header
- **AND** every active user from `DataContext.users` is rendered with their `name` and `@ {group}`

#### Scenario: Selecting a user updates the active username and preserves role

- **GIVEN** the active user is `joao.silva` and the active role is `admin`
- **WHEN** the operator opens the dropdown and selects `ana.pereira`
- **THEN** the active username SHALL change to `ana.pereira`
- **AND** the active role SHALL remain `admin`
- **AND** the dropdown SHALL close

#### Scenario: Disabled users are hidden from the picker

- **GIVEN** `DataContext.users` contains a user with `status: 'disabled'`
- **WHEN** the topbar dropdown is opened
- **THEN** that user SHALL NOT appear in the Switch user list

#### Scenario: Admin tab edits live-sync into the picker

- **GIVEN** the active role is `admin` and the topbar dropdown is closed
- **WHEN** an admin creates a new user `demo.tester` in group `educ` via the admin Users tab
- **AND** the operator subsequently opens the topbar dropdown without reloading
- **THEN** `demo.tester @ educ` SHALL appear in the Switch user list

#### Scenario: Active user persists across reloads

- **GIVEN** the operator picked `ana.pereira` as the active user
- **WHEN** the SPA is reloaded
- **THEN** the active user SHALL still be `ana.pereira`
- **AND** the persistence mechanism SHALL be `localStorage` key `gdfkube.demoUser`

---

### Requirement: X-Demo-Role header synchronously reflects the active role

The SPA's API client (`src/api/itsmApi.ts`) MUST send an `X-Demo-Role: operator | admin` header on every `/api/itsm/*` request, alongside the existing `X-Demo-User` header. The header value MUST be updated synchronously (within the same React render that mutates `role`) so no API call can carry a stale role. Implementations MUST NOT defer this header update to a `useEffect`. The initial `demoRoleRef` default MUST be `'admin'` so admin-gated Bootstrap fetches succeed before `App` mounts.

#### Scenario: Every /api/itsm request carries X-Demo-Role

- **GIVEN** the active role is `operator`
- **WHEN** any code path calls the SPA's `api()` helper for a `/api/itsm/*` endpoint
- **THEN** the outbound request SHALL include `X-Demo-Role: operator` in its headers

#### Scenario: Role change synchronously updates the demo-role header

- **GIVEN** the active role is `operator`
- **WHEN** the operator selects `Admin perspective` in the role section
- **THEN** the next API call made anywhere in the app SHALL carry `X-Demo-Role: admin`
- **AND** there SHALL be no intermediate render in which a fetch could fire with the stale role

#### Scenario: Active role persists across reloads

- **GIVEN** the operator selected `Admin perspective`
- **WHEN** the SPA is reloaded
- **THEN** the active role SHALL still be `admin`
- **AND** the persistence mechanism SHALL be `localStorage` key `gdfkube.demoRole`

---

## MODIFIED Requirements

### Requirement: Topbar with breadcrumbs, search, role switcher

The portal MUST render a topbar containing a breadcrumb trail derived from the current route, a search input with a `⌘K` hint, a refresh icon-button, a notifications icon-button (with a pip indicator), and a user dropdown showing the current user's initials, name, and `org · role` line. The user dropdown MUST contain two stacked menu sections: a `Switch user` section listing every active demo user from `DataContext.users` (described under "Switch user picker in topbar dropdown") and a `Switch role` section with exactly two options labeled `Operator perspective` and `Admin perspective`; selecting one MUST update the active role and MUST NOT change the active user. The user dropdown MUST include a "Settings" item with a cog icon that navigates to the `settings` route and closes the dropdown. The dropdown MUST NOT include a "Preferences" item.

When the active user changes, the `X-Demo-User` header value the API client will send on its next call MUST be updated synchronously (within the same React render that mutates `activeUsername`). When the active role changes, the `X-Demo-Role` header MUST be updated synchronously in the same way. Implementations MUST NOT defer either header update to a `useEffect`.

#### Scenario: breadcrumbs reflect route

- **GIVEN** the current route is `request-detail` with `routeParams.id = "REQ0010247C"`
- **WHEN** the topbar renders for an `operator`
- **THEN** the breadcrumbs read `My requests / REQ0010247C`

#### Scenario: switching role updates the role perspective only

- **GIVEN** the active user is `ana.pereira` (group `educ`) and the active role is `operator`
- **WHEN** the user opens the dropdown and selects `Admin perspective`
- **THEN** the active role SHALL change to `admin`
- **AND** the active user SHALL remain `ana.pereira`
- **AND** the topbar avatar, name, and `org` portion of the org-role line SHALL be unchanged
- **AND** the role-suffix of the org-role line SHALL update to reflect `Platform Admin`

#### Scenario: role switch synchronously updates demo-role header

- **GIVEN** the active role is `operator` and the active user is `ana.pereira` (next-call headers: `X-Demo-User: ana.pereira`, `X-Demo-Role: operator`)
- **WHEN** the user selects `Admin perspective` in the role section
- **THEN** the next API call made anywhere in the app SHALL carry `X-Demo-User: ana.pereira` AND `X-Demo-Role: admin`
- **AND** there SHALL be no intermediate render in which a fetch could fire with the stale role

#### Scenario: user switch synchronously updates demo-user header

- **GIVEN** the active user is `joao.silva` and the active role is `admin` (next-call headers: `X-Demo-User: joao.silva`, `X-Demo-Role: admin`)
- **WHEN** the user selects `ana.pereira` in the Switch user section
- **THEN** the next API call made anywhere in the app SHALL carry `X-Demo-User: ana.pereira` AND `X-Demo-Role: admin`
- **AND** there SHALL be no intermediate render in which a fetch could fire with the stale username

#### Scenario: role menu offers only operator-perspective and admin-perspective

- **WHEN** the role section of the dropdown is opened
- **THEN** the visible options SHALL be exactly `Operator perspective` and `Admin perspective`
- **AND** neither option SHALL carry a user-name subtitle (no `joao.silva @ saude` / `m.costa @ setic` annotations)
- **AND** no `Approver` or `Service` options SHALL appear

#### Scenario: Settings item replaces Preferences in user dropdown

- **GIVEN** a signed-in user opens the topbar user dropdown
- **WHEN** the dropdown renders
- **THEN** the menu SHALL show a "Settings" item with a cog icon
- **AND** the menu SHALL NOT show a "Preferences" item

#### Scenario: Settings item navigates to settings route

- **GIVEN** the topbar user dropdown is open
- **WHEN** the user clicks the "Settings" menu item
- **THEN** the app SHALL navigate to the `settings` route
- **AND** the dropdown SHALL close
