## ADDED Requirements

### Requirement: Requests list role-aware tabs

The Requests list page MUST render three tabs above the table when the role is `admin`: "Mine" (filtered to requests where `requester.username === user.username`), "Department" (filtered to requests where `requesterGroupName === user.group`), and "All" (no filter). Each tab MUST display a count badge equal to the number of requests it would show. When the role is `operator` only the "Mine" tab is visible.

#### Scenario: admin sees three tabs with counts

- **GIVEN** the active role is `admin` and seed data contains 3 mine, 4 department, 8 total
- **WHEN** the page renders
- **THEN** three tab buttons are present
- **AND** the "Mine" tab badge shows `3`, "Department" shows `4`, "All" shows `8`

#### Scenario: switching tab narrows table

- **GIVEN** the All tab is active showing 8 rows
- **WHEN** the user clicks the Department tab
- **THEN** exactly 4 rows render
- **AND** every row has `requesterGroupName === user.group`

### Requirement: Toolbar with CSV export and New request CTA

The Requests list MUST render a toolbar above the table with: a ghost "Export CSV" button (decorative for the demo — clicking dispatches a "CSV export queued (demo)" info toast and does not download anything), and a primary "New request" button that navigates to the `catalog` route.

#### Scenario: clicking New request opens catalog

- **WHEN** the user clicks the toolbar's "New request" button
- **THEN** the active route becomes `catalog`

### Requirement: Full nine-column table with env color coding

The Requests list table MUST render exactly nine columns in this order: Number (`r.id`), Cluster (`r.vars.clusterName ?? r.formLabel`), Department (`r.requesterGroupName`), Environment (`r.env`, color-coded), Nodes (`r.vars.nodes ?? "—"`), Requester (`r.requester.fullName ?? r.requester.username`), Status (StatusPill), Submitted (time portion), and a chevron link cell (`<Icons.ext>`) to the request-detail route. The Environment cell MUST color-code by env: `production` red, `staging` amber, `development` green.

#### Scenario: production env renders red

- **GIVEN** a request with `env: "production"`
- **WHEN** the row renders
- **THEN** its Environment cell has color `var(--red-500)` (or equivalent CSS variable resolution to red)

### Requirement: "Showing X of Y" counter and filter icon

The Requests list MUST render a `<Icons.filter>` icon adjacent to the status filter chips and a `<small>` counter to the right of the chip row reading "Showing X of Y" where X is the number of currently visible rows and Y is the unfiltered count for the active tab.

#### Scenario: counter updates on filter

- **GIVEN** the All tab shows 8 rows total and 3 are in `provisioning`
- **WHEN** the user clicks the Provisioning chip
- **THEN** the counter reads "Showing 3 of 8"
