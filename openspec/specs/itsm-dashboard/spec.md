# itsm-dashboard Specification

## Purpose
TBD - created by archiving change build-itsm-portal. Update Purpose after archive.
## Requirements
### Requirement: Role-aware dashboard heading

The Dashboard page MUST render the heading "Welcome back, João" with the subtitle "Saúde · Department of Health · Operator role" when the active role is `operator`, and the heading "Platform Overview" with the subtitle "Fleet health and recent activity across all departments." when the active role is `admin`.

#### Scenario: operator dashboard heading

- **GIVEN** the active role is `operator`
- **WHEN** the Dashboard page renders
- **THEN** the page title is "Welcome back, João"
- **AND** the page subtitle is "Saúde · Department of Health · Operator role"

#### Scenario: admin dashboard heading

- **GIVEN** the active role is `admin`
- **WHEN** the Dashboard page renders
- **THEN** the page title is "Platform Overview"

### Requirement: Pipeline health banner

The Dashboard MUST render a banner card with an info icon, the heading "Pipeline operating normally", a subtitle reporting last-24h metrics (clusters provisioned, median time-to-ready, manual interventions), and a "View activity" button that navigates to the requests list.

#### Scenario: clicking banner CTA navigates to requests

- **WHEN** the user clicks the banner's "View activity" button
- **THEN** the active route changes to `requests`

### Requirement: Three KPI cards

The Dashboard MUST render exactly three KPI cards in a `kpi-grid` layout: Active Clusters, Pending Provisioning, and Failed Last 30d. Each card MUST show a label, a numeric value, and a delta line; cards with a `trend` of `up` or `down` MUST display a directional triangle prefix.

#### Scenario: KPI grid contains three cards

- **WHEN** the Dashboard page renders
- **THEN** the `.kpi-grid` element contains exactly three `.kpi` children
- **AND** the labels are "Active Clusters", "Pending Provisioning", "Failed Last 30d"

### Requirement: Recent requests table

The Dashboard MUST render a card titled "Recent Requests" containing a table with columns Number, Cluster, Department, Status, Submitted, listing the four most recent requests from seed data. Each row MUST be clickable and MUST navigate to the `request-detail` route with the request's `id`.

#### Scenario: row click opens detail

- **WHEN** the user clicks the row for `REQ0010247`
- **THEN** the active route changes to `request-detail` with `routeParams.id === "REQ0010247"`

### Requirement: Activity stream card

The Dashboard MUST render a card titled "Activity Stream" listing entries from `RECENT_ACTIVITY` with a colored dot per entry (green for `ok`, amber for `warn`, red for `err`, civic-blue for `info`), the activity text, the relative time, and the actor.

#### Scenario: activity colors map to types

- **GIVEN** an activity entry of type `err`
- **WHEN** the entry renders
- **THEN** its leading dot has the background color `var(--red-500)`

### Requirement: Dashboard renders .banner block and .detail-grid layout

The Dashboard MUST render its banner card with the `.banner` class (engaging the existing dark-gradient block in `styles.css`) instead of the generic `.card` wrapper. The Recent Requests and Activity Stream cards MUST be laid out side-by-side via the existing `.detail-grid` rule (2.2fr / 1fr columns) instead of stacked vertically.

#### Scenario: banner uses .banner class

- **WHEN** the Dashboard renders the pipeline-health card
- **THEN** the card's outer element has the class `banner`
- **AND** does NOT have the class `card`

#### Scenario: detail-grid hosts both side cards

- **WHEN** the Dashboard renders below the KPI grid
- **THEN** an element with class `detail-grid` contains both the Recent Requests card and the Activity Stream card as direct children

### Requirement: Operator dashboard exposes "New cluster request" header CTA

When the active role is `operator`, the Dashboard's page-head MUST render a `.page-head-row` containing the operator title alongside a primary "New cluster request" button that navigates to the `new-request` route with `routeParams.formId === "cluster-request"`.

#### Scenario: clicking the header CTA opens cluster-request

- **GIVEN** the active role is `operator`
- **WHEN** the user clicks the "New cluster request" button in the dashboard header
- **THEN** the active route becomes `new-request`
- **AND** `routeParams.formId === "cluster-request"`

### Requirement: Recent Requests "View all" CTA and Activity Stream "Refresh" affordance

The Recent Requests card MUST render a "View all" ghost button in its card header that navigates to the `requests` route. The Activity Stream card MUST render a "Refresh" ghost button in its card header (decorative for the demo — clicking it MUST trigger a brief visual indication of refresh, e.g. a toast or icon spin, without mutating data).

#### Scenario: clicking View all opens requests list

- **WHEN** the user clicks "View all" in the Recent Requests card header
- **THEN** the active route becomes `requests`

### Requirement: Recent Requests Submitted column shows time only

The Recent Requests Submitted column MUST display only the time portion of the timestamp (e.g. "11:43"), matching the reference behavior. Full date/time MAY appear as a `title` attribute for hover.

#### Scenario: row shows time only

- **GIVEN** a recent request with `submittedAt: "2026-05-04 11:43:12"`
- **WHEN** the row renders in the Recent Requests table
- **THEN** the Submitted cell text is `11:43`

