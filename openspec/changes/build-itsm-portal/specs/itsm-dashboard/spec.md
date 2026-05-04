## ADDED Requirements

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
