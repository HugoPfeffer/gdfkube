## ADDED Requirements

### Requirement: Queue header KPI tiles

The Approvals page-head MUST render three KPI tiles to the right of the title: "In queue" (count of `state.requests.filter(r => r.status === "approval")`), "Approved today" (count of `decidedThisSession` whose decision was `approved`), and "Rejected today" (count whose decision was `rejected`). Tiles MUST update in real time as decisions are made.

#### Scenario: in-queue tile reflects pending count

- **GIVEN** seed data with 3 requests in `status: "approval"`
- **WHEN** the Approvals page renders
- **THEN** an element with label "In queue" and value `3` is present in the page header

#### Scenario: approving a request increments approved-today

- **GIVEN** the page header shows "Approved today: 0"
- **WHEN** the admin approves a pending request
- **THEN** the page header shows "Approved today: 1"

### Requirement: Queue row shows failing-checks badge, requester, colored env

Each pending-queue row MUST render: a failing-checks badge (only when `r.policyChecks.some(c => !c.ok)`) with the count of failing checks; the requester's display name (`r.requester.fullName ?? r.requester.username`); and the env (color-coded as in the requests list: production red, staging amber, development green).

#### Scenario: failing badge appears when policy fails

- **GIVEN** a queue row for a request whose `policyChecks` includes one with `ok: false`
- **WHEN** the row renders
- **THEN** an element with text matching `1 failing` (or `2 failing` etc.) is present in the row

### Requirement: Filter bar uses class-based spacing

The Approvals page's `.filters` container MUST derive its padding from the `.filters` CSS class rule — it MUST NOT use inline `style` attributes for padding. This ensures spacing is consistent across all pages that reuse the `.filters` class (Approvals, RequestsList) and allows density-aware overrides via a single CSS source.

#### Scenario: filters element has no inline padding

- **WHEN** the Approvals page renders its filter chip bar
- **THEN** the `.filters` element has no `style` attribute containing `padding`

### Requirement: Reject button requires comment

The Reject button on the DecisionPanel MUST be disabled while the comment textarea is empty (after `String.prototype.trim()`). Clicking Reject without a comment MUST NOT dispatch any state change and MUST NOT close the override modal.

#### Scenario: reject disabled with empty comment

- **GIVEN** a request is selected and the comment textarea is empty
- **WHEN** the page renders the DecisionPanel
- **THEN** the Reject button has the `disabled` attribute

#### Scenario: reject enables when comment present

- **GIVEN** the comment textarea contains "Insufficient justification"
- **WHEN** the DecisionPanel re-renders
- **THEN** the Reject button is not disabled

## MODIFIED Requirements

### Requirement: Decision detail panel

When a queue item is selected, the right pane MUST render: a header containing a StatusPill and a title "Cluster {clusterName}" (cluster pulled from `r.vars.clusterName`); the request's payload (`vars` + `meta`) with the requester's justification rendered inline beneath the payload (NOT in a separate "Justification" card); the policy and governance checks (each as PASS or WARN with the check's label); a comment textarea; primary Approve and Reject buttons (Reject is disabled until the comment is non-empty per the Reject-comment-required requirement); secondary Reassign and Request changes buttons; and a 3-step approval chain visualization labeled "Department lead → Platform admin (you) → Provisioning pipeline" (matching the request's lifecycle, not the abstract "Operator submitted → Group lead → SETIC" triple).

#### Scenario: decision panel header shows StatusPill and cluster title

- **GIVEN** a request with `status: "approval"` and `vars.clusterName: "vacinacao"`
- **WHEN** the request is selected in the queue
- **THEN** a StatusPill with text "Awaiting approval" is present in the decision panel
- **AND** a heading "Cluster vacinacao" is present

#### Scenario: justification renders inline beneath payload

- **GIVEN** a selected request with non-empty `justification`
- **WHEN** the DecisionPanel renders
- **THEN** the justification text is rendered as a `<blockquote>` directly below the payload card
- **AND** no separate card titled "Justification" is rendered

#### Scenario: chain labels match lifecycle

- **WHEN** any request is selected
- **THEN** the approval-chain visualization contains, in order, the labels "Department lead", "Platform admin (you)", "Provisioning pipeline"
