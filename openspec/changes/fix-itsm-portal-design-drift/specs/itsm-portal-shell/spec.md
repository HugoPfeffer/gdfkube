## ADDED Requirements

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
