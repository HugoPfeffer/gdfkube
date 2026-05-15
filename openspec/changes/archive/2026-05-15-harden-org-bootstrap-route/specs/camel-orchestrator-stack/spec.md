## MODIFIED Requirements

### Requirement: org-bootstrap SHALL idempotently provision per-org GitOps content from group events

The `org-bootstrap` route MUST consume `dbz.gdfkube.groups` (group `gdfkube-camel`, `auto.offset.reset=earliest`, manual commit) and MUST react to group lifecycle CDC events with the following filter:

- `op=c` → accept
- `op=r` → accept (snapshot row)
- `op=u` → accept (any change to a group document re-evaluates the bootstrap state)
- `op=d` → drop (no decommission flow in this capability)
- `op` missing (neither `__op` nor `op` headers present) → drop with a WARN log carrying the raw body; the offset MUST be committed and the message MUST NOT be sent to DLQ

The route MUST apply a 60-second in-memory dedup cache keyed on the group's `_id` to absorb Debezium replays. The dedup cache MUST be populated **only after** a successful `gitProvider.commitAndPush(...)`; a failed exchange MUST leave the cache untouched so the next redelivery is not suppressed.

The route MUST register an `.onCompletion()` handler that deletes the per-exchange `outputDir` tree (walking in reverse order, mirroring `HelmRenderRoute`). The handler MUST read `outputDir` from an exchange property set by `processGroupEvent`, and MUST be tolerant of `outputDir == null` (e.g. when the event was dropped at the header check).

For each accepted event the route MUST:

1. Extract `groupId = node._id`. The route MUST NOT read `node.repo`; the canonical repo name comes from `helmValuesBuilder.getRepoName(groupId)`.
2. Ensure the per-org Gitea repo `gdfkube-{groupId}` exists via `GitRepoBootstrapper.ensure(owner, repoName, description)` (idempotent skip-if-exists; emits `create-repo` audit on creation).
3. Ensure the central Gitea repo `gdfkube-orgs` exists via the same bean (idempotent; emits `create-repo` audit on creation).
4. Acquire a per-repo `ReentrantLock` for `gdfkube-orgs`, then clone or pull it.
5. Compute the three target paths under `<workTree>/orgs/<groupId>/`:
   - `appproject.yaml`
   - `applicationset.yaml`
   - `<groupId>-clusterset.yaml`
6. If all target paths exist on disk, emit a `noop` audit event and return WITHOUT rendering or pushing.
7. Otherwise, allocate a per-exchange scratch directory via `Files.createTempDirectory("bootstrap-" + groupId + "-")` and store its path as the `outputDir` exchange property. Render `argocd-org` and `rhacm-org` charts via `HelmTemplateRunner.render(chartRef, releaseName, valuesPath, outputDir)` using values from `HelmValuesBuilder.buildForOrg(groupId)`. Concatenate the two `rhacm-org` outputs (ManagedClusterSet + ManagedClusterSetBinding) into a single multi-doc YAML separated by `---` and write as `<groupId>-clusterset.yaml`.
8. Copy ONLY the missing files into `<workTree>/orgs/<groupId>/`. Files already present MUST NOT be overwritten.
9. Commit and push with author `gdfkube-camel <camel@gdfkube.gov.br>` and message `[gdfkube] GROUP-{groupId}: bootstrap org manifests`.
10. Populate `dedupCache[groupId] = System.currentTimeMillis()` immediately after the successful push and **before** the audit emit.
11. Emit a `bootstrap` audit event with the list of files added.
12. Commit the Kafka offset only after step 11 succeeds.

The route MUST NOT invoke `status-emitter` and MUST NOT call `stageUpdater` — group events have no request stage. On exception during steps 2-11 the route MUST publish to `dlq.gdfkube.groups` per the standard error-handling requirement; the existing `dlq-handler` route already consumes `dlq.gdfkube.*` and persists the message. The `.onCompletion()` cleanup MUST run on both success and exception paths.

#### Scenario: First group event bootstraps both repos and writes all three files

- **GIVEN** the route is running and Gitea has neither `gdfkube-cultura` nor `gdfkube-orgs`
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

#### Scenario: Event with missing op header is dropped without DLQ

- **GIVEN** the route is running
- **WHEN** a `dbz.gdfkube.groups` message arrives with neither `__op` nor `op` headers set
- **THEN** the route SHALL log at WARN level including the raw body
- **AND** no clone, no commit, no helm render, and no DLQ message SHALL be produced
- **AND** the Kafka offset SHALL be committed

#### Scenario: Replay within 60 seconds is suppressed by dedup cache

- **GIVEN** the route has just successfully processed an event for group `cultura`
- **WHEN** the same event is replayed within 60 seconds
- **THEN** exactly one commit SHALL exist on `gdfkube-orgs` for that group
- **AND** the second invocation SHALL be suppressed by the dedup cache

#### Scenario: helm render failure leaves the dedup cache empty

- **GIVEN** `HelmTemplateRunner.render(...)` throws on the first invocation for group `cultura`
- **WHEN** a second `op=u` event for `cultura` arrives after redeliveries are exhausted but within 60 seconds of the first
- **THEN** `dedupCache` SHALL NOT contain `cultura` after the failed exchange completes
- **AND** the second event SHALL be processed (not suppressed by the cache)

#### Scenario: outputDir scratch tree is cleaned up after every exchange

- **GIVEN** the route processes an `op=c` event for group `cultura` end-to-end
- **WHEN** the exchange completes (success path or after exception)
- **THEN** the per-exchange `bootstrap-cultura-*` directory under `java.io.tmpdir` SHALL no longer exist
- **AND** the `.onCompletion()` handler SHALL tolerate the case where no `outputDir` property was set (e.g. an `op==null` drop)

#### Scenario: helm render failure flows to the groups DLQ

- **GIVEN** `HelmTemplateRunner.render(...)` throws on invocation
- **WHEN** an event for group `cultura` is processed (after 3 redeliveries with 1s/5s/25s backoff)
- **THEN** the message SHALL land on `dlq.gdfkube.groups` with all 9 mandatory DLQ context headers

---

### Requirement: HelmValuesBuilder SHALL produce values for org-bootstrap charts

The `gov.gdf.camel.bean.HelmValuesBuilder` bean MUST expose a `buildForOrg(String groupId)` method that allocates a per-call values file via `Files.createTempFile("bootstrap-" + groupId + "-", ".yaml")` and returns its absolute path. The method MUST NOT accept a `groupRepo` parameter; the canonical repo name, when needed, is derived internally via `getRepoName(groupId)`. The values document MUST contain:

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

The existing `build(RequestEvent)` method MUST remain unchanged. New `getChartRef(String chartName)` and `getReleaseName(String groupId)` overloads MUST be available for the `org-bootstrap` route.

#### Scenario: buildForOrg writes a values file with the canonical naming shape

- **GIVEN** `app.system.gitea-owner=gdf` and `app.system.gitea-external-url=https://gitea.gdfkube.gov.br`
- **WHEN** `HelmValuesBuilder.buildForOrg("cultura")` is invoked
- **THEN** the returned path SHALL match `bootstrap-cultura-*.yaml` under `java.io.tmpdir`
- **AND** the file SHALL parse as YAML with `meta.requestId == "bootstrap-cultura"`, `meta.formId == "org-bootstrap"`, `system.naming.appProject == "cultura"`, `system.naming.clusterSet == "cultura"`, `system.naming.namespace == "cultura"`
- **AND** `system.labels` SHALL contain the 6 required labels with values derived from `groupId == "cultura"`

#### Scenario: Concurrent buildForOrg calls for the same groupId do not collide

- **GIVEN** two threads concurrently invoke `HelmValuesBuilder.buildForOrg("cultura")`
- **WHEN** both calls return
- **THEN** the two returned paths SHALL be distinct
- **AND** each file SHALL contain a valid values document

#### Scenario: build(RequestEvent) is unchanged after the addition

- **GIVEN** the new `buildForOrg(String)` signature has replaced `buildForOrg(String, String)`
- **WHEN** the existing `HelmValuesBuilderTest` (covering `build(RequestEvent)`) runs
- **THEN** the test SHALL pass without modification
