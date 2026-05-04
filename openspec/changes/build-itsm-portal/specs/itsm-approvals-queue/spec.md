## ADDED Requirements

### Requirement: Admin-only access

The Approvals page MUST be reachable only when the active role is `admin`. When the role transitions to `operator` while the route is `approvals`, the App MUST redirect to `home`.

#### Scenario: operator role redirects away from approvals

- **GIVEN** the active route is `approvals` and role is `admin`
- **WHEN** the user switches role to `operator`
- **THEN** the active route becomes `home`

### Requirement: Pending queue with filter chips

The page MUST render a left pane listing every request whose `status === "approval"`. The pane MUST include filter chips for All, Production (filters to `env === "production"`), and Scale (filters to `form === "scale"`). Exactly one chip MUST be active at a time.

#### Scenario: production chip filters queue

- **GIVEN** seed data contains 3 approval-status requests, 2 with `env: "production"`
- **WHEN** the user clicks the Production chip
- **THEN** the left queue lists exactly 2 requests
- **AND** all listed requests have `env === "production"`

### Requirement: Decision detail panel

When a queue item is selected, the right pane MUST render the request's payload, the requester's justification quoted, the policy and governance checks (each as PASS or WARN), a comment textarea, primary Approve and Reject buttons, and secondary Reassign and Request changes buttons. The pane MUST also render a 3-step approval chain visualization.

#### Scenario: selecting a queue item populates the detail pane

- **GIVEN** the queue is showing 3 pending requests
- **WHEN** the user clicks the row for `REQ0010238`
- **THEN** the detail pane shows the justification text from `REQ0010238`
- **AND** the policy checks for `REQ0010238` are listed with PASS or WARN labels

### Requirement: No estimated cost field

The Approvals detail pane MUST NOT render an estimated-cost row.

#### Scenario: cost field absent

- **WHEN** any request is selected in the Approvals detail
- **THEN** no element labeled "Est. cost" or "Estimated cost" is present

### Requirement: Approve transitions request to provisioning

Clicking Approve MUST set the selected request's `status` to `provisioning`, set `stage` to `1`, append the admin's decision to its approval chain, remove the request from the pending queue, and append it to the decided-this-session log. A success toast confirming the decision MUST appear.

#### Scenario: approving moves request out of queue

- **GIVEN** request `REQ0010249` has `status: "approval"` and is selected
- **WHEN** the admin clicks Approve
- **THEN** `GDF_DATA.REQUESTS` for `REQ0010249` shows `status === "provisioning"` and `stage === 1`
- **AND** the request no longer appears in the pending queue
- **AND** the decided-this-session log includes `REQ0010249`

### Requirement: Override modal for failing policy checks

Clicking Approve while the selected request has at least one policy check with `ok: false` MUST first open an override modal requiring an explicit confirmation before the approval is committed.

#### Scenario: override required when policy fails

- **GIVEN** the selected request has a policy check with `ok: false`
- **WHEN** the admin clicks Approve
- **THEN** an override modal is rendered
- **AND** the request's status is unchanged until the modal's Confirm button is clicked

### Requirement: Reject transitions request to failed

Clicking Reject MUST set the selected request's `status` to `failed`, append the rejection (with the comment text, if any) to its approval chain, and remove the request from the pending queue.

#### Scenario: rejecting marks request failed

- **GIVEN** request `REQ0010251` is selected with status `approval`
- **WHEN** the admin clicks Reject
- **THEN** `GDF_DATA.REQUESTS` for `REQ0010251` shows `status === "failed"`
