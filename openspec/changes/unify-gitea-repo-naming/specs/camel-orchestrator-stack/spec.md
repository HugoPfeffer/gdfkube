## ADDED Requirements

### Requirement: HelmValuesBuilder SHALL be the single source of truth for per-org Gitea repo names

The `gov.gdf.camel.bean.HelmValuesBuilder` bean MUST expose a `String getRepoName(String groupId)` method that returns `"gdfkube-" + groupId`. This method MUST be the only place in the Camel orchestrator that composes a per-org Gitea repo name. `RepoBootstrapRoute` and `OrgBootstrapRoute` MUST call this helper instead of composing the name inline. The `gdfkube-` prefix is a brand constant and MUST NOT be derived from `app.system.gitea-owner`.

#### Scenario: getRepoName returns the canonical gdfkube-prefixed name

- **GIVEN** `HelmValuesBuilder` is constructed
- **WHEN** `getRepoName("cultura")` is invoked
- **THEN** the return value SHALL equal `"gdfkube-cultura"`

#### Scenario: Both routes call the helper for the same group

- **GIVEN** `app.system.gitea-owner=gdf` and a group `cultura`
- **WHEN** `RepoBootstrapRoute` processes a request with `requesterGroupName=cultura` AND `OrgBootstrapRoute` processes a `dbz.gdfkube.groups` event with `_id=cultura`
- **THEN** both routes SHALL invoke `gitRepoBootstrapper.ensure("gdf", "gdfkube-cultura", ...)` (identical owner and repoName arguments)

#### Scenario: No remaining inline composition

- **WHEN** the source tree under `gdfkube-src/gdfkube-camel/src/main/java/` is searched for `"gdfkube-" *+` (string-prefix concatenation)
- **THEN** the only match SHALL be inside `HelmValuesBuilder.getRepoName`

---

## MODIFIED Requirements

### Requirement: HelmValuesBuilder SHALL produce values for org-bootstrap charts

The `gov.gdf.camel.bean.HelmValuesBuilder` bean MUST expose a `buildForOrg(String groupId)` method that writes `/tmp/{groupId}-bootstrap-values.yaml` and returns its path. The values document MUST contain:

- `meta.requestId` = `bootstrap-{groupId}`
- `meta.formId` = `org-bootstrap`
- `meta.org` = `{groupId}`
- `meta.email` = `null`
- `meta.submittedAt` = ISO-8601 timestamp at invocation
- `meta.correlationId` = `bootstrap-{groupId}`
- `system.naming.appProject` = `{groupId}`
- `system.naming.clusterSet` = `{groupId}`
- `system.naming.hostedClusterName` = `{groupId}`
- `system.naming.namespace` = `{groupId}`
- `system.labels.*` = the 6 required labels
- `system.giteaExternalUrl` = the configured `app.system.gitea-external-url`
- `system.giteaOwner` = the configured `app.system.gitea-owner`
- `vars` = `{}`

The existing `build(RequestEvent)` method MUST remain unchanged. New `getChartRef(String chartName)` and `getReleaseName(String groupId)` overloads MUST be available for the `org-bootstrap` route. The bean MUST NOT accept a separate `groupRepo` parameter on `buildForOrg`; the per-org repo name is derived from `groupId` via `getRepoName` when needed by callers.

#### Scenario: buildForOrg writes a values file with the canonical naming shape

- **GIVEN** `app.system.gitea-owner=gdf` and `app.system.gitea-external-url=https://gitea.gdfkube.gov.br`
- **WHEN** `HelmValuesBuilder.buildForOrg("cultura")` is invoked
- **THEN** the returned path SHALL be `/tmp/cultura-bootstrap-values.yaml`
- **AND** the file SHALL parse as YAML with `meta.requestId == "bootstrap-cultura"`, `meta.formId == "org-bootstrap"`, `system.naming.appProject == "cultura"`, `system.naming.clusterSet == "cultura"`

#### Scenario: buildForOrg has no groupRepo parameter

- **GIVEN** the `HelmValuesBuilder` bean
- **WHEN** its public method signatures are inspected via reflection
- **THEN** no public method named `buildForOrg` SHALL accept a second `String` argument

#### Scenario: build(RequestEvent) is unchanged after the addition

- **GIVEN** the new `buildForOrg` method has been added
- **WHEN** the existing `HelmValuesBuilderTest` (covering `build(RequestEvent)`) runs
- **THEN** the test SHALL pass without modification

---

### Requirement: org-bootstrap SHALL idempotently provision per-org GitOps content from group events

The `org-bootstrap` route MUST consume `dbz.gdfkube.groups` (group `gdfkube-camel`, `auto.offset.reset=earliest`, manual commit) and MUST react to group lifecycle CDC events with the following filter:

- `op=c` → accept
- `op=r` → accept (snapshot row)
- `op=u` → accept (any change to a group document re-evaluates the bootstrap state)
- `op=d` → drop (no decommission flow in this capability)

The route MUST apply a 60-second in-memory dedup cache keyed on the group's `_id` to absorb Debezium replays.

For each accepted event the route MUST:

1. Extract `groupId = node._id`. The per-org Gitea repo name MUST be obtained from `HelmValuesBuilder.getRepoName(groupId)`; the route MUST NOT compose `"gdfkube-" + groupId` inline and MUST NOT read a `repo` field from the group document for this purpose.
2. Ensure the per-org Gitea repo `gdfkube-{groupId}` exists via `GitRepoBootstrapper.ensure(owner, repoName, description)` where `repoName = helmValuesBuilder.getRepoName(groupId)` (idempotent skip-if-exists; emits `create-repo` audit on creation).
3. Ensure the central Gitea repo `gdfkube-orgs` exists via the same bean (idempotent; emits `create-repo` audit on creation).
4. Acquire a per-repo `ReentrantLock` for `gdfkube-orgs`, then clone or pull it.
5. Compute the three target paths under `<workTree>/orgs/<groupId>/`:
   - `appproject.yaml`
   - `applicationset.yaml`
   - `<groupId>-clusterset.yaml`
6. If all target paths exist on disk, emit a `noop` audit event and return WITHOUT rendering or pushing.
7. Otherwise, render `argocd-org` and `rhacm-org` charts via `HelmTemplateRunner.render(chartRef, releaseName, valuesPath, outputDir)` using values from `HelmValuesBuilder.buildForOrg(groupId)`. Concatenate the two `rhacm-org` outputs (ManagedClusterSet + ManagedClusterSetBinding) into a single multi-doc YAML separated by `---` and write as `<groupId>-clusterset.yaml`.
8. Copy ONLY the missing files into `<workTree>/orgs/<groupId>/`. Files already present MUST NOT be overwritten.
9. Commit and push with author `gdfkube-camel <camel@gdfkube.gov.br>` and message `[gdfkube] GROUP-{groupId}: bootstrap org manifests`.
10. Emit a `bootstrap` audit event with the list of files added. The audit payload's `repo` field MUST be composed as `app.system.gitea-owner + "/" + helmValuesBuilder.getRepoName(groupId)` (NOT inline string concatenation).
11. Commit the Kafka offset only after step 10 succeeds.

The route MUST NOT invoke `status-emitter` and MUST NOT call `stageUpdater` — group events have no request stage. On exception the route MUST publish to `dlq.gdfkube.groups` per the standard error-handling requirement; the existing `dlq-handler` route already consumes `dlq.gdfkube.*` and persists the message.

#### Scenario: First group event bootstraps both repos and writes all three files

- **GIVEN** the route is running, Gitea has neither `gdfkube-cultura` nor `gdfkube-orgs`, and `app.system.gitea-owner=gdfkube`
- **WHEN** an `op=c` event arrives for a group with `_id=cultura`
- **THEN** `gdfkube-cultura` SHALL be created in Gitea
- **AND** `gdfkube-orgs` SHALL be created in Gitea
- **AND** a single commit on `gdfkube-orgs` SHALL contain exactly three files: `orgs/cultura/appproject.yaml`, `orgs/cultura/applicationset.yaml`, `orgs/cultura/cultura-clusterset.yaml`
- **AND** the commit message SHALL match `[gdfkube] GROUP-cultura: bootstrap org manifests`

#### Scenario: Replay of an already-bootstrapped group is a noop

- **GIVEN** the route has previously bootstrapped group `cultura` and all three target files exist in `gdfkube-orgs`
- **WHEN** another `op=u` event arrives for the same group
- **THEN** no second commit SHALL be produced on `gdfkube-orgs`
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

#### Scenario: Replay within 60 seconds is suppressed by dedup cache

- **GIVEN** the route has just successfully processed an event for group `cultura`
- **WHEN** the same event is replayed within 60 seconds
- **THEN** exactly one commit SHALL exist on `gdfkube-orgs` for that group
- **AND** the second invocation SHALL be suppressed by the dedup cache

#### Scenario: helm render failure flows to the groups DLQ

- **GIVEN** `HelmTemplateRunner.render(...)` throws on invocation
- **WHEN** an event for group `cultura` is processed (after 3 redeliveries with 1s/5s/25s backoff)
- **THEN** the message SHALL land on `dlq.gdfkube.groups` with all 9 mandatory DLQ context headers

#### Scenario: Audit repo field uses the helper

- **GIVEN** `app.system.gitea-owner=gdf`
- **WHEN** the `bootstrap` audit event is emitted for group `cultura`
- **THEN** the `repo` field SHALL equal `"gdf/gdfkube-cultura"`
- **AND** the code path that produced this field SHALL go through `helmValuesBuilder.getRepoName("cultura")` (no inline `"gdfkube-" +` concatenation)
