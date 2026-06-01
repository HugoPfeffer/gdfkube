## ADDED Requirements

### Requirement: Org repos and scaffolding SHALL be created only by the request pipeline

Per-org GitOps content — the per-org Gitea repo `gdfkube-{org}` and the central `gdfkube-orgs/orgs/{org}/` ArgoCD scaffolding (`appproject.yaml`, `applicationset.yaml`, `{org}-clusterset.yaml`) — MUST be created **only** as a step of the ITSM request provisioning pipeline. When `request-router` accepts a request (`status == "provisioning"`), the pipeline MUST, before pushing workloads in `git-push`, ensure the org's scaffolding exists for `org = requesterGroupName` by invoking the `org-bootstrap` step (`direct:org-bootstrap`). The scaffolding step MUST be idempotent: when all three target files already exist for the org, it MUST NOT produce a new commit.

#### Scenario: Provisioned request creates the org scaffolding before workloads

- **GIVEN** a request for `requesterGroupName = saude` flips to `status = provisioning`
- **AND** `gdfkube-orgs/orgs/saude/` does not yet exist
- **WHEN** the request pipeline runs
- **THEN** `repo-bootstrap` SHALL ensure repo `gdfkube-saude` exists
- **AND** the `org-bootstrap` step SHALL commit `orgs/saude/appproject.yaml`, `orgs/saude/applicationset.yaml`, and `orgs/saude/saude-clusterset.yaml` to `gdfkube-orgs`
- **AND** this SHALL occur before `git-push` writes the per-request workloads under `gdfkube-saude/clusters/{release}/`

#### Scenario: Second request for the same org is a scaffolding noop

- **GIVEN** `gdfkube-orgs/orgs/saude/` already contains all three scaffolding files
- **WHEN** another request for `saude` is provisioned
- **THEN** the `org-bootstrap` step SHALL NOT produce a second scaffolding commit on `gdfkube-orgs`
- **AND** the request's workloads SHALL still be pushed under `gdfkube-saude/clusters/{release}/`

### Requirement: Deployment-time seeding SHALL NOT create org repos or scaffolding

Platform bootstrap MUST NOT create any per-org repo or org scaffolding. No Camel consumer SHALL react to the seeded `gdfkube.groups` documents (whether via Debezium snapshot `op=r` events or otherwise). Seeding the `gdfkube.groups` MongoDB collection for the ITSM SPA MUST remain in place, but it MUST NOT trigger any Gitea repo or manifest creation.

#### Scenario: Clean bootstrap creates no org artifacts

- **GIVEN** a fresh platform bootstrap with the 7 demo groups seeded into MongoDB `gdfkube.groups`
- **WHEN** Debezium completes its initial snapshot and the Camel app starts
- **THEN** no `gdfkube-{org}` repo and no `gdfkube-orgs/orgs/*` scaffolding SHALL be created
- **AND** the demo ArgoCD discovery ApplicationSet SHALL report no broken/incomplete org Applications

#### Scenario: SPA still reads the seeded groups

- **GIVEN** the platform is bootstrapped
- **WHEN** the ITSM SPA requests `GET /api/itsm/groups`
- **THEN** the 7 seeded demo groups SHALL be returned
