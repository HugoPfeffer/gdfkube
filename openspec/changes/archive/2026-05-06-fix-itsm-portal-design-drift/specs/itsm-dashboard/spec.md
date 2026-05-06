## ADDED Requirements

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
