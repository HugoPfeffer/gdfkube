## MODIFIED Requirements

### Requirement: Eight Camel routes SHALL be defined per the topology

The Camel app MUST define exactly 9 routes:

| Route | Source | Sink |
|---|---|---|
| `request-router` | `kafka:dbz.gdfkube.requests` | direct routes to `helm-render` |
| `helm-render` | direct from `request-router` | direct to `git-push` |
| `git-push` | direct from `helm-render` | direct to `repo-bootstrap` on 404 |
| `repo-bootstrap` | direct from `git-push` on 404 | re-enters `git-push` |
| `status-emitter` | direct/Camel SEDA invoked at pipeline entry | `kafka:gdfkube.pipeline.status` + `mongodb:requests` (stage write-back) |
| `audit-sink` | `kafka:gdfkube.audit` (group `gdfkube-camel`) | `mongodb:audit_log` |
| `config-reload` | `kafka:dbz.gdfkube.forms` (group `gdfkube-camel`) | `bean:FormDefCache#refresh` |
| `dlq-handler` | `kafka:dlq.gdfkube.*` (multi-pattern, group `gdfkube-camel`) | `mongodb:dlq_log` |
| `org-bootstrap` | `kafka:dbz.gdfkube.groups` (group `gdfkube-camel`) | git push to central `gdfkube-orgs` repo + `kafka:gdfkube.audit` |

All Kafka consumers MUST use group `gdfkube-camel` and MUST set `enable.auto.commit=false`. Pipeline consumers (`request-router`, `config-reload`, `dlq-handler`, `org-bootstrap`) MUST set `auto.offset.reset=earliest`. `kafkaManualCommit.commitSync()` MUST be invoked only after the unit of work completes successfully.

#### Scenario: All 9 routes register on startup

- **GIVEN** the Camel app starts cleanly
- **WHEN** `curl http://gdfkube-camel:8080/q/camel/routes` is queried
- **THEN** the response SHALL list exactly the 9 route IDs: `request-router`, `helm-render`, `git-push`, `repo-bootstrap`, `status-emitter`, `audit-sink`, `config-reload`, `dlq-handler`, `org-bootstrap`
- **AND** every route SHALL be in state `Started`

---

## ADDED Requirements

### Requirement: org-bootstrap SHALL idempotently provision per-org GitOps content from group events

The `org-bootstrap` route MUST consume `dbz.gdfkube.groups` (group `gdfkube-camel`, `auto.offset.reset=earliest`, manual commit) and MUST react to group lifecycle CDC events with the following filter:

- `op=c` → accept
- `op=r` → accept (snapshot row)
- `op=u` → accept (any change to a group document re-evaluates the bootstrap state)
- `op=d` → drop (no decommission flow in this capability)

The route MUST apply a 60-second in-memory dedup cache keyed on the group's `_id` to absorb Debezium replays.

For each accepted event the route MUST:

1. Extract `groupId = node._id` and `groupRepo = node.repo` (falling back to `gdfkube-{groupId}` if `repo` is empty/missing).
2. Ensure the per-org Gitea repo `gdfkube-{groupId}` exists via `GitRepoBootstrapper.ensure(owner, repoName, description)` (idempotent skip-if-exists; emits `create-repo` audit on creation).
3. Ensure the central Gitea repo `gdfkube-orgs` exists via the same bean (idempotent; emits `create-repo` audit on creation).
4. Acquire a per-repo `ReentrantLock` for `gdfkube-orgs`, then clone or pull it.
5. Compute the four target paths under `<workTree>/orgs/<groupId>/`:
   - `appproject.yaml`
   - `applicationset.yaml`
   - `<groupId>-clusterset.yaml`
6. If all target paths exist on disk, emit a `noop` audit event and return WITHOUT rendering or pushing.
7. Otherwise, render `argocd-org` and `rhacm-org` charts via `HelmTemplateRunner.render(chartRef, releaseName, valuesPath, outputDir)` using values from `HelmValuesBuilder.buildForOrg(groupId, groupRepo)`. Concatenate the two `rhacm-org` outputs (ManagedClusterSet + ManagedClusterSetBinding) into a single multi-doc YAML separated by `---` and write as `<groupId>-clusterset.yaml`.
8. Copy ONLY the missing files into `<workTree>/orgs/<groupId>/`. Files already present MUST NOT be overwritten.
9. Commit and push with author `gdfkube-camel <camel@gdfkube.gov.br>` and message `[gdfkube] GROUP-{groupId}: bootstrap org manifests`.
10. Emit a `bootstrap` audit event with the list of files added.
11. Commit the Kafka offset only after step 10 succeeds.

The route MUST NOT invoke `status-emitter` and MUST NOT call `stageUpdater` — group events have no request stage. On exception the route MUST publish to `dlq.gdfkube.groups` per the standard error-handling requirement; the existing `dlq-handler` route already consumes `dlq.gdfkube.*` and persists the message.

The in-cluster `metadata.name` of the rendered `AppProject`, `ManagedClusterSet`, and `ManagedClusterSetBinding` MUST be the bare `<groupId>` (no `-clusterset` suffix on resource names — the suffix appears only on the filename to disambiguate from the AppProject manifest).

#### Scenario: First group event bootstraps both repos and writes all four files

- **GIVEN** the route is running and Gitea has neither `gdfkube-cultura` nor `gdfkube-orgs`
- **WHEN** an `op=c` event arrives for a group with `_id=cultura` and `repo=gdfkube-cultura`
- **THEN** `gdfkube-cultura` SHALL be created in Gitea
- **AND** `gdfkube-orgs` SHALL be created in Gitea
- **AND** a single commit on `gdfkube-orgs` SHALL contain exactly three files: `orgs/cultura/appproject.yaml`, `orgs/cultura/applicationset.yaml`, `orgs/cultura/cultura-clusterset.yaml`
- **AND** the commit message SHALL match `[gdfkube] GROUP-cultura: bootstrap org manifests`

#### Scenario: Replay of an already-bootstrapped group is a noop

- **GIVEN** the route has previously bootstrapped group `cultura` and all three target files exist in `gdfkube-orgs`
- **WHEN** another `op=u` event arrives for the same group
- **THEN** no second commit SHALL be produced on `gdfkube-orgs`
- **AND** no repo SHALL be re-created
- **AND** an audit event with verb `noop` SHALL be emitted

#### Scenario: Partial state self-heals on next event

- **GIVEN** `gdfkube-orgs` already contains `orgs/cultura/appproject.yaml` only
- **WHEN** an event for `cultura` arrives
- **THEN** the resulting commit SHALL contain exactly `orgs/cultura/applicationset.yaml` and `orgs/cultura/cultura-clusterset.yaml`
- **AND** the existing `orgs/cultura/appproject.yaml` SHALL NOT be modified

#### Scenario: Delete event is dropped

- **GIVEN** the route is running
- **WHEN** an `op=d` event arrives for group `cultura`
- **THEN** no clone, no commit, and no DLQ message SHALL be produced
- **AND** the offset SHALL be committed without further work

#### Scenario: Replay within 60 seconds is suppressed by dedup cache

- **GIVEN** the route has just successfully processed an event for group `cultura`
- **WHEN** the same event is replayed within 60 seconds
- **THEN** exactly one commit SHALL exist on `gdfkube-orgs` for that group
- **AND** the second invocation SHALL be suppressed by the dedup cache rather than the file-exists check

#### Scenario: helm render failure flows to the groups DLQ

- **GIVEN** `HelmTemplateRunner.render(...)` throws on invocation
- **WHEN** an event for group `cultura` is processed (after 3 redeliveries with 1s/5s/25s backoff per the standard error-handling requirement)
- **THEN** the message SHALL land on `dlq.gdfkube.groups` with all 9 mandatory DLQ context headers
- **AND** the existing `dlq-handler` route SHALL persist it to `dlq_log`

---

### Requirement: Reusable beans SHALL back the request and org-bootstrap pipelines

The Camel module MUST provide two beans whose responsibilities are shared by the request pipeline (`repo-bootstrap`, `helm-render`) and the new `org-bootstrap` route:

- `gov.gdf.camel.bean.GitRepoBootstrapper#ensure(String owner, String repoName, String description)` MUST encapsulate the `gitProvider.repoExists` check followed by `gitProvider.createRepo` when absent. It MUST be idempotent (no-op when the repo exists).
- `gov.gdf.camel.bean.HelmTemplateRunner#render(String chartRef, String releaseName, String valuesPath, String outputDir)` MUST shell out to `helm template <release> /opt/charts/<chartRef> --values <valuesPath> --output-dir <outputDir> --include-crds` and return the list of rendered output paths. It MUST surface the helm subprocess exit code as an exception on non-zero.

The `repo-bootstrap` route MUST delegate its repo-existence/creation step to `GitRepoBootstrapper.ensure`. The `helm-render` route MUST delegate its helm subprocess invocation to `HelmTemplateRunner.render`. The observable behavior of both routes MUST remain unchanged after the delegation.

#### Scenario: GitRepoBootstrapper skips when repo already exists

- **GIVEN** `gitProvider.repoExists(owner, "gdfkube-cultura")` returns `true`
- **WHEN** `GitRepoBootstrapper.ensure(owner, "gdfkube-cultura", "...")` is invoked
- **THEN** `gitProvider.createRepo(...)` SHALL NOT be called
- **AND** the bean SHALL return without error

#### Scenario: GitRepoBootstrapper creates when repo absent

- **GIVEN** `gitProvider.repoExists(owner, "gdfkube-orgs")` returns `false`
- **WHEN** `GitRepoBootstrapper.ensure(owner, "gdfkube-orgs", "Org bootstrap manifests rendered by gdfkube-camel")` is invoked
- **THEN** `gitProvider.createRepo(owner, "gdfkube-orgs", ...)` SHALL be called exactly once

#### Scenario: HelmTemplateRunner surfaces non-zero subprocess exit

- **GIVEN** `helm template ...` exits with a non-zero status (e.g., schema-validation failure)
- **WHEN** `HelmTemplateRunner.render(...)` is invoked
- **THEN** the bean SHALL throw an exception carrying the non-zero exit code and the captured stderr
- **AND** the calling route SHALL fall through to its existing `errorHandler(deadLetterChannel(...))` redelivery + DLQ behavior

#### Scenario: Existing PipelineIntegrationTest passes after the delegation

- **GIVEN** `RepoBootstrapRoute` and `HelmRenderRoute` have been refactored to delegate to the new beans
- **WHEN** `PipelineIntegrationTest.goldenPath_existingRepoIsNotRecreated` runs
- **THEN** the test SHALL pass without modification

---

### Requirement: HelmValuesBuilder SHALL produce values for org-bootstrap charts

The `gov.gdf.camel.bean.HelmValuesBuilder` bean MUST expose a `buildForOrg(String groupId, String groupRepo)` method that writes `/tmp/{groupId}-bootstrap-values.yaml` and returns its path. The values document MUST contain:

- `meta.requestId` = `bootstrap-{groupId}`
- `meta.formId` = `org-bootstrap`
- `meta.org` = `{groupId}`
- `meta.email` = `null`
- `meta.submittedAt` = ISO-8601 timestamp at invocation
- `meta.correlationId` = `bootstrap-{groupId}`
- `system.naming.appProject` = `{groupId}`
- `system.naming.clusterSet` = `{groupId}`
- `system.naming.hostedClusterName` = `{groupId}` (unused by `argocd-org`/`rhacm-org` but harmless to set; preserves the canonical `system.naming` shape)
- `system.naming.namespace` = `{groupId}`
- `system.labels.*` = the 6 required labels (reuses the same `buildLabels(groupId, "bootstrap-" + groupId)` helper used by the request pipeline)
- `system.giteaExternalUrl` = the configured `app.system.gitea-external-url`
- `system.giteaOwner` = the configured `app.system.gitea-owner`
- `vars` = `{}` (these charts do not consume `vars`)

The existing `build(RequestEvent)` method MUST remain unchanged. New `getChartRef(String chartName)` and `getReleaseName(String groupId)` overloads MUST be available for the `org-bootstrap` route.

#### Scenario: buildForOrg writes a values file with the canonical naming shape

- **GIVEN** `app.system.gitea-owner=gdf` and `app.system.gitea-external-url=https://gitea.gdfkube.gov.br`
- **WHEN** `HelmValuesBuilder.buildForOrg("cultura", "gdfkube-cultura")` is invoked
- **THEN** the returned path SHALL be `/tmp/cultura-bootstrap-values.yaml`
- **AND** the file SHALL parse as YAML with `meta.requestId == "bootstrap-cultura"`, `meta.formId == "org-bootstrap"`, `system.naming.appProject == "cultura"`, `system.naming.clusterSet == "cultura"`, `system.naming.namespace == "cultura"`
- **AND** `system.labels` SHALL contain the 6 required labels with values derived from `groupId == "cultura"`

#### Scenario: build(RequestEvent) is unchanged after the addition

- **GIVEN** the new `buildForOrg` method has been added
- **WHEN** the existing `HelmValuesBuilderTest` (covering `build(RequestEvent)`) runs
- **THEN** the test SHALL pass without modification
