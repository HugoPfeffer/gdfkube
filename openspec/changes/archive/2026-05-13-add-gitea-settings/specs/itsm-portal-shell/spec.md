## MODIFIED Requirements

### Requirement: Topbar with breadcrumbs, search, role switcher

The portal MUST render a topbar containing a breadcrumb trail derived from the current route, a search input with a `⌘K` hint, a refresh icon-button, a notifications icon-button (with a pip indicator), and a role switcher menu showing the current user's initials, name, and `org · role` line. Clicking the role switcher MUST open a menu with Operator and Admin options; selecting one MUST update the active role. The user dropdown MUST include a "Settings" item with a cog icon that navigates to the `settings` route and closes the dropdown. The dropdown MUST NOT include a "Preferences" item.

#### Scenario: breadcrumbs reflect route

- **GIVEN** the current route is `request-detail` with `routeParams.id = "REQ0010247"`
- **WHEN** the topbar renders for an `operator`
- **THEN** the breadcrumbs read `My requests / REQ0010247`

#### Scenario: switching role updates topbar identity

- **GIVEN** the active role is `operator` and the user is `João Silva`
- **WHEN** the user opens the role menu and selects `Platform Admin`
- **THEN** the topbar avatar shows `MC`, the name updates to `Maria Costa`, and the org-role line reads `SETIC · Platform Admin`

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

---

## ADDED Requirements

### Requirement: Settings route in RouteName union and App routing

The `RouteName` union type MUST include `'settings'`. The `App.tsx` breadcrumb logic MUST return `['Settings']` for the `settings` route. The `App.tsx` render logic MUST render the `<Settings />` page component when `route === 'settings'`.

#### Scenario: settings route renders breadcrumb

- **GIVEN** the current route is `settings`
- **WHEN** the breadcrumb trail is computed
- **THEN** the breadcrumbs SHALL read `Settings`

#### Scenario: settings route renders the Settings page

- **GIVEN** the current route is `settings`
- **WHEN** the App component renders
- **THEN** the `<Settings />` page component SHALL be rendered in the main content area
