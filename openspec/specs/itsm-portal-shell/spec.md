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

The portal MUST render a topbar containing a breadcrumb trail derived from the current route, a search input with a `⌘K` hint, a refresh icon-button, a notifications icon-button (with a pip indicator), and a role switcher menu showing the current user's initials, name, and `org · role` line. Clicking the role switcher MUST open a menu with Operator and Admin options; selecting one MUST update the active role.

#### Scenario: breadcrumbs reflect route

- **GIVEN** the current route is `request-detail` with `routeParams.id = "REQ0010247"`
- **WHEN** the topbar renders for an `operator`
- **THEN** the breadcrumbs read `My requests / REQ0010247`

#### Scenario: switching role updates topbar identity

- **GIVEN** the active role is `operator` and the user is `João Silva`
- **WHEN** the user opens the role menu and selects `Platform Admin`
- **THEN** the topbar avatar shows `MC`, the name updates to `Maria Costa`, and the org-role line reads `SETIC · Platform Admin`

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

