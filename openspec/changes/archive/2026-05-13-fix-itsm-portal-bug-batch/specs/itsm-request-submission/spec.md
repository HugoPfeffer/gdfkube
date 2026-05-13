## MODIFIED Requirements

### Requirement: Radio-cards display variant for select fields

When a select field has `displayAs: "radio-cards"`, the runner MUST render the field as a row of radio-card components, each showing the option's label, optional description, and an optional colored dot when `dotColor` is provided. The colored dot MUST render as a visible 8×8 pixel circle with `border-radius: 50%` and `background` equal to the option's `dotColor`. The dot's size and shape MUST NOT depend on any external CSS class — it MUST be styled inline so the dot is visible regardless of stylesheet loading state.

#### Scenario: environment renders as radio cards with visible dots

- **GIVEN** the `environment` field has `type: "select"` and `displayAs: "radio-cards"` with three options including `dotColor` values `#16a34a`, `#f59e0b`, `#dc2626`
- **WHEN** the runner renders the field
- **THEN** three radio-card elements are present
- **AND** each card displays a span 8 pixels wide, 8 pixels tall, with `border-radius: 50%` and `background` equal to its option's `dotColor`

### Requirement: Submission creates a request with status approval

On Submit, the runner MUST POST to `/api/itsm/requests` and obtain a new id from the server. The id MUST match `^REQ\d{7}[CNSX]$` (REQ + 7 digits + form-type letter: `C` for cluster-request, `N` for namespace-request, `S` for scale-request, `X` for unknown). The server MUST persist the request with `status: "approval"`, `stage: 0`, populated `meta` (including `requestId`, `correlationId`, `requesterName`, `requesterFullName`, `requesterEmail`, `requesterRole`, `submittedAt`, `formId`) and `vars` payloads, a non-empty `justification` if provided, and at least one `policyChecks` entry. The runner MUST then navigate to the `request-detail` route with the new id and trigger the "Request submitted for approval" toast.

#### Scenario: submission lands at approval status

- **GIVEN** the operator fills the cluster-request form
- **WHEN** they click Submit
- **THEN** a new request is persisted with `status === "approval"` and `_id` matching `^REQ\d{7}C$`
- **AND** the active route is `request-detail` for the new id
- **AND** an info toast titled "Request submitted for approval" is rendered

#### Scenario: namespace-request gets N suffix

- **GIVEN** the operator submits the `namespace-request` form
- **WHEN** the server creates the document
- **THEN** the new `_id` ends in the letter `N`

#### Scenario: unknown formId gets X suffix and server warning

- **GIVEN** a `formId` not in `{ cluster-request, namespace-request, scale-request }`
- **WHEN** the server creates the document
- **THEN** the new `_id` ends in the letter `X`
- **AND** the server emits a warning log identifying the unknown `formId`

#### Scenario: concurrent submissions do not produce duplicate ids

- **GIVEN** two concurrent `POST /api/itsm/requests` calls for the `cluster-request` form
- **WHEN** both submissions race for the same counter value
- **THEN** the duplicate-key retry resolves the collision and both submissions succeed with distinct sequential `REQ*C` ids
