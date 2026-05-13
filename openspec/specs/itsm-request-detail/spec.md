# itsm-request-detail Specification

## Purpose
TBD - created by archiving change build-itsm-portal. Update Purpose after archive.
## Requirements
### Requirement: Seven-stage CDC pipeline visualization

The Request Detail page MUST render a horizontal pipeline visualization with exactly seven stages in the fixed order: Form, MongoDB, Debezium, Kafka, Camel, Git, ArgoCD. Each stage MUST display its label, sub-label, an icon, and a state class (`done`, `active`, `pending`, or `failed`) derived from the request's `status` and `stage`.

The Camel orchestrator MUST advance the request's `stage` field in MongoDB as work progresses through each stage. Specifically: stage 4 (Camel) MUST be written when `RequestRouterRoute` first receives the request from Kafka; stage 5 (Git) MUST be written after the Gitea repo has been successfully created/pushed by `RepoBootstrapRoute`/`GitPushRoute`. Stage updates MUST be monotonic — implementations MUST use a `$max` update on `stage` so out-of-order Kafka events cannot decrement a higher stage to a lower one.

Stage 6 (ArgoCD) MUST NOT be written by this change. ArgoCD integration is deferred to a future spec; until then, ready requests SHALL leave stage 6 in the `active` (animated) state.

#### Scenario: stages reflect current progress

- **GIVEN** request `REQ0010247C` has `status: "provisioning"` and `stage: 4` (Camel)
- **WHEN** the Request Detail page renders
- **THEN** stages 1–4 (Form, MongoDB, Debezium, Kafka) render with class `done`
- **AND** stage 5 (Camel) renders with class `active`
- **AND** stages 6–7 render with class `pending`

#### Scenario: failed stage stops progression

- **GIVEN** request `REQ0010235C` has `status: "failed"` and `stage: 5` (Git push)
- **WHEN** the page renders
- **THEN** stage 5 renders with class `failed`
- **AND** stages 6–7 render with class `pending`

#### Scenario: Camel emits intermediate stage write on receipt

- **GIVEN** an approved request with `stage: 1` lands on the `dbz.gdfkube.requests` Kafka topic
- **WHEN** `RequestRouterRoute` consumes the message
- **THEN** the document's `stage` is updated to 4 via `$max`

#### Scenario: Git push emits stage update

- **GIVEN** `RepoBootstrapRoute`/`GitPushRoute` completes a Gitea push for a request
- **WHEN** the route succeeds
- **THEN** the document's `stage` is updated to 5 via `$max`

#### Scenario: Out-of-order events do not regress stage

- **GIVEN** a document already at `stage: 5`
- **WHEN** a late-arriving event tries to set `stage: 4`
- **THEN** the `$max` update is a no-op and `stage` remains 5

#### Scenario: ArgoCD stage remains pending until that spec lands

- **GIVEN** a request whose Camel pipeline has finished (Gitea repo created) with `stage: 5`
- **WHEN** the Request Detail page renders
- **THEN** stage 6 (ArgoCD) renders with class `active` (animated)
- **AND** no code path in this change writes stage 6

### Requirement: Pipeline animation responds to tweak

When `status === "provisioning"`, the active stage's animation duration MUST scale inversely with the `pipelineSpeed` tweak value (a higher tweak value MUST visibly accelerate the animation).

#### Scenario: doubling speed halves animation duration

- **GIVEN** the active animation duration is 4s at `pipelineSpeed: 1`
- **WHEN** `pipelineSpeed` is set to `2`
- **THEN** the active animation duration becomes 2s

### Requirement: Request Details, Approvals, Cluster Access panels

The page MUST render three side panels: Request Details (showing `id`, requester, cluster, environment, nodes, submitted timestamp, current status pill), Approvals (the approval chain with each step's actor and decision), and Cluster Access. The Cluster Access panel MUST only render when `r.status === "ready"`. When rendered, it MUST contain a `<dl>` with API URL, Console URL, and OpenShift Version rows (values from `r.vars.apiUrl`, `r.vars.consoleUrl`, `r.vars.ocpVersion` with sensible synthesized fallbacks for the demo) and a primary "Download kubeconfig" button. When `r.status !== "ready"` the panel MUST NOT render at all (no disabled placeholder, no explanation paragraph).

#### Scenario: cluster access hidden when not ready

- **GIVEN** a request with `status: "provisioning"`
- **WHEN** the Request Detail page renders
- **THEN** no element with text "Cluster Access" is present in the DOM

#### Scenario: cluster access renders with dl rows when ready

- **GIVEN** a request with `status: "ready"` and `vars.apiUrl: "https://api.demo:6443"`
- **WHEN** the page renders
- **THEN** a panel titled "Cluster Access" is present
- **AND** within it a `<dl>` row labels "API URL" and the value `https://api.demo:6443`

### Requirement: No raw manifests rendered

The Request Detail page MUST NOT render a "Generated Manifests" card or any other view exposing the underlying YAML artifacts written to Git.

#### Scenario: no manifests card present

- **WHEN** the Request Detail page renders for any request
- **THEN** no element with text matching "Generated Manifests" is present in the DOM

### Requirement: No pipeline activity log card

The Request Detail page MUST NOT render a "Pipeline Activity" log card.

#### Scenario: no activity log card

- **WHEN** the page renders
- **THEN** no element with the heading "Pipeline Activity" is present

### Requirement: Request Detail page header

The Request Detail page MUST render a `.page-head` containing: a StatusPill on the top row alongside the request id (mono); a level-1 title showing "Cluster {clusterName} · {orgName}" where `clusterName` resolves from `r.vars.clusterName` and `orgName` from `state.orgs.find(o => o.id === r.requesterGroupName)?.fullName ?? r.requesterGroupName`; a subtitle "Submitted by {requester.fullName}"; and an actions row with: a "← Back" ghost button (navigates to the `requests` route), an "Open in Gitea" ghost button (decorative — opens an external link demo toast), an "Approve" primary button (visible only when role is `admin` AND `r.status === "approval"`, navigates to `approvals` with the request preselected), and a "Download kubeconfig" primary button (visible AND enabled only when `r.status === "ready"`).

#### Scenario: title shows cluster name and org

- **GIVEN** a request with `vars.clusterName: "vacinacao"` and `requesterGroupName: "saude"`
- **AND** `state.orgs` contains `{id:"saude", fullName:"Secretaria da Saúde"}`
- **WHEN** the Request Detail page renders
- **THEN** the title text is "Cluster vacinacao · Secretaria da Saúde"

#### Scenario: kubeconfig button only when ready

- **GIVEN** a request with `status: "provisioning"`
- **WHEN** the Request Detail page renders
- **THEN** no element with text matching "Download kubeconfig" is enabled
- **AND** when the same request transitions to `status: "ready"`, the button becomes enabled

### Requirement: Pipeline section header

The Pipeline section MUST be wrapped in a `.section-head` with the title "Provisioning Pipeline", a status pill (`Live` if `status === "provisioning"`, `Completed` if `ready`, `Failed` if `failed`, hidden if `approval`), and an overall progress bar showing `r.progress`% (or 0 when undefined). The bar MUST animate smoothly between value changes.

#### Scenario: provisioning shows Live pill and progress

- **GIVEN** a request with `status: "provisioning"` and `progress: 58`
- **WHEN** the Request Detail page renders
- **THEN** an element with text "Live" is present in the pipeline section header
- **AND** an element with class `progress-bar` has inline width `58%`

