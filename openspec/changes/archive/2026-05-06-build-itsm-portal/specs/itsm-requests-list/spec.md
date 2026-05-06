## ADDED Requirements

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
