# itsm-portal-shell Specification

## Purpose
TBD - created by archiving change build-itsm-portal. Update Purpose after archive.
## Requirements
### Requirement: Utility band

The portal SHALL render a fixed utility band at the top of the viewport showing the demo-environment status indicator and the application version, occupying 26px height with a navy-900 background.

#### Scenario: utility band visible on every page

- **GIVEN** any route in the portal
- **WHEN** the page renders
- **THEN** a `.utility` element is present with a green status dot, the text `Demo environment · operational`, and a right-aligned version label

### Requirement: Sidebar with role-gated navigation

The portal MUST render a left sidebar listing Workspace items (Home, Service Catalog, My Requests) for all roles, plus Operations (Approvals) and Administration (Forms, Users) sections only when the active role is `admin`. The Approvals item MUST display a numeric badge equal to the count of requests with `status === "approval"` whenever the count is non-zero. The sidebar MUST collapse to icon-only when the `sidebarCollapsed` tweak is true.

#### Scenario: operator does not see admin sections

- **GIVEN** the active role is `operator`
- **WHEN** the sidebar renders
- **THEN** the Operations and Administration section headers and their child items (Approvals, Forms, Users) are not in the DOM

#### Scenario: admin sees all sections and approvals badge

- **GIVEN** the active role is `admin`
- **AND** there are 3 requests with `status === "approval"` in seed data
- **WHEN** the sidebar renders
- **THEN** the Approvals nav item shows a badge with the value `3`
- **AND** the Forms and Users items are present under the Administration section

#### Scenario: collapsed sidebar hides labels

- **GIVEN** the `sidebarCollapsed` tweak is `true`
- **WHEN** the sidebar renders
- **THEN** only icons are visible, brand subtitle is hidden, and each nav item has its `title` set to its label for tooltip support

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

### Requirement: Toast stack for transient feedback

The portal SHALL render a toast notification when a request is submitted (`info` toast: "Request submitted for approval") or when a request transitions to `provisioning` (`success` toast: "Request submitted"). Toasts MUST auto-dismiss after 5 seconds and MUST be dismissable via an explicit close icon.

#### Scenario: submit triggers approval-toast

- **WHEN** a new request is submitted from the New Request page
- **THEN** an info toast with title "Request submitted for approval" appears in the toast stack
- **AND** the toast disappears after 5 seconds

### Requirement: Demo-only Tweaks panel

The portal MUST expose a Tweaks panel allowing the user to set `theme` (`light` | `dark`), `density` (`comfortable` | `compact`), `sidebarCollapsed` (boolean), `pipelineSpeed` (0.5–4 with 0.1 step), and `showDemoBanner` (boolean), plus quick-action buttons to toggle role and open the new-request flow. Tweak values MUST persist across page reloads via `localStorage` under the key `gdfkube.tweaks`.

#### Scenario: theme tweak applies to document

- **GIVEN** the Tweaks panel is open
- **WHEN** the user selects `dark` for theme
- **THEN** `document.documentElement` gets the attribute `data-theme="dark"`
- **AND** reloading the page restores `data-theme="dark"` from localStorage

### Requirement: App layout uses the .app CSS Grid host

The root App component MUST render its outer wrapper as `<div className="app" data-density={tweaks.density}>` so the existing `.app` CSS Grid layout (`grid-template-areas: utility / sidebar / topbar / main`, `grid-template-columns: 240px 1fr` at `:has(.sidebar.collapsed)` 64px / 1fr) and the `[data-density="compact"]` selector engage at runtime. The wrapper MUST NOT use the dead `app-shell` / `shell` / `main-col` class chain. The optional demo banner MUST use a non-conflicting modifier class (e.g. `with-banner`) so it does not stomp on the page-level `.banner` rule used by Dashboard.

#### Scenario: density tweak applies to root

- **WHEN** the user toggles density to `compact`
- **THEN** `document.querySelector(".app")` has the attribute `data-density="compact"`
- **AND** the `--row-h` custom property resolves to `30px` via the `.app[data-density="compact"]` selector

#### Scenario: dead wrapper classes absent

- **WHEN** the App renders for any role and any route
- **THEN** no element in the rendered tree has the class `app-shell`, `shell`, or `main-col`

### Requirement: Interactive element CSS resets for semantic HTML

All interactive elements rendered as `<button>` that serve as navigation items, menu items, tabs, or radio-cards MUST apply CSS resets to eliminate browser-default button chrome. Specifically:

- `.nav-item` (sidebar): MUST set `width: 100%; text-align: left; background: none; border: none;` so `<button>` nav items render full-width and flush with the sidebar.
- `.menu-item` (topbar dropdown): MUST set `width: 100%; text-align: left; background: none; border: none;` for role-switch dropdown items.
- `.tab` (page tabs): MUST set `background: none; border: none;` so tab buttons on Forms/Users pages inherit the tab strip styling.
- `.radio-card`: MUST set `appearance: none; font: inherit; text-align: left; color: inherit;` to render as styled cards without native button appearance.

Form inputs MUST be styled for all common types. The `.field input` selector MUST cover `input[type="text"]`, `input[type="email"]`, `input[type="password"]`, `input[type="number"]`, and `input[type="search"]`. A base input rule MUST also exist for standalone inputs outside `.field` wrappers (e.g. filter bars), applying consistent height, border, border-radius, padding, and focus ring.

#### Scenario: button nav-item renders full-width

- **WHEN** the sidebar renders a `<button>` element with class `nav-item`
- **THEN** the button spans the full sidebar width
- **AND** has no visible border or background distinct from its container

#### Scenario: email input inside .field gets styled

- **WHEN** a form renders an `input[type="email"]` inside a `.field` wrapper
- **THEN** the input has the standard field height (`var(--row-h)` or 36px), border, and focus ring

### Requirement: TweaksPanel accessible focus management

The TweaksPanel MUST focus its first interactive control when it opens, MUST trap Tab cycling within the panel while open, MUST return focus to the trigger button when it closes, and MUST close on `Escape`.

#### Scenario: panel focuses theme select on open

- **WHEN** the user opens the Tweaks panel
- **THEN** `document.activeElement` is the theme `<select>` (the first control in the panel)

#### Scenario: escape closes the panel and returns focus

- **GIVEN** the Tweaks panel is open and theme select is focused
- **WHEN** the user presses `Escape`
- **THEN** the panel is closed
- **AND** `document.activeElement` is the trigger button that opened it

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

