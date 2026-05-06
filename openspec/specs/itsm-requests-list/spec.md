# itsm-requests-list Specification

## Purpose
TBD - created by archiving change build-itsm-portal. Update Purpose after archive.
## Requirements
### Requirement: Role-scoped request list

The Requests list page MUST show only requests where `requester` matches the active user's username when the role is `operator`, and MUST show all requests when the role is `admin`.

#### Scenario: operator sees only own requests

- **GIVEN** the active role is `operator` and the user is `joao.silva`
- **AND** the seed contains requests by `joao.silva`, `maria.costa`, and `carlos.mendes`
- **WHEN** the requests list renders without status filters applied
- **THEN** only rows whose `requester === "joao.silva"` appear in the table

#### Scenario: admin sees all requests

- **GIVEN** the active role is `admin`
- **WHEN** the requests list renders
- **THEN** all requests from `GDF_DATA.REQUESTS` appear

### Requirement: Status filters

The list MUST provide filter chips that scope the table to a specific status: All, Approval, Provisioning, Ready, Failed. The active chip MUST be visually distinguished and only one chip MUST be active at a time.

#### Scenario: provisioning chip filters to provisioning rows

- **WHEN** the user clicks the "Provisioning" chip
- **THEN** the table renders only rows whose `status === "provisioning"`
- **AND** the chip is rendered with the active modifier

### Requirement: Inline progress on provisioning rows

A row whose `status === "provisioning"` MUST render an inline progress indicator showing the request's current `stage` and `progress`. Rows in other statuses MUST NOT render the progress indicator.

#### Scenario: provisioning row shows progress

- **GIVEN** request `REQ0010247` has `status: "provisioning"`, `stage: 4`, `progress: 58`
- **WHEN** the row renders
- **THEN** an inline progress indicator is present showing 58% and the stage label "Camel"

### Requirement: Page title reflects role

The page title MUST read "My requests" when the role is `operator` and "All requests" when the role is `admin`.

#### Scenario: admin sees All requests title

- **GIVEN** the active role is `admin`
- **WHEN** the page renders
- **THEN** the page title is "All requests"

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

