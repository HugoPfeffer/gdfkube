## ADDED Requirements

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

## MODIFIED Requirements

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
