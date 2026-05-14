## 1. Trigger plumbing — Mongo + Debezium

- [ ] 1.1 Update `gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js` to enable change-stream pre-image (`collMod` with `changeStreamPreAndPostImages: { enabled: true }`) on `gdfkube.groups` if not already enabled. Idempotent on re-run.
- [ ] 1.2 Update `gdfkube-src/gdfkube-infra/debezium/connector-config.json`: change `collection.include.list` from `gdfkube.requests,gdfkube.forms` to `gdfkube.requests,gdfkube.forms,gdfkube.groups`.
- [ ] 1.3 Confirm `register-connector.sh` (or equivalent bootstrap script) PUTs the updated config so the connector picks up the new collection on next reconnect.

## 2. Bean extractions — preserve existing behavior

- [ ] 2.1 Create `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/GitRepoBootstrapper.java` with method `void ensure(String owner, String repoName, String description)` containing the current `gitProvider.repoExists` + `createRepo` logic from `RepoBootstrapRoute`.
- [ ] 2.2 Refactor `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/RepoBootstrapRoute.java` to delegate to `GitRepoBootstrapper.ensure`. Keep the audit emit and stage update inline (request-pipeline concerns).
- [ ] 2.3 Create `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmTemplateRunner.java` with method `List<Path> render(String chartRef, String releaseName, String valuesPath, String outputDir)` wrapping the current `helm template …` `ProcessBuilder` invocation from `HelmRenderRoute`. Same `/opt/charts/{chartRef}` resolution; same `--include-crds`. Surface non-zero exit via thrown exception with stderr captured.
- [ ] 2.4 Refactor `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/HelmRenderRoute.java` to delegate to `HelmTemplateRunner.render` (no behavior change).
- [ ] 2.5 Run `./mvnw -pl gdfkube-src/gdfkube-camel test`; confirm the existing `PipelineIntegrationTest` (including `goldenPath_existingRepoIsNotRecreated`) passes unchanged.

## 3. HelmValuesBuilder extension

- [ ] 3.1 In `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java`, add `String buildForOrg(String groupId, String groupRepo) throws IOException`. Output `/tmp/{groupId}-bootstrap-values.yaml` with `meta` (requestId=`bootstrap-{groupId}`, formId=`org-bootstrap`, org=`{groupId}`, email=null, submittedAt=now, correlationId=`bootstrap-{groupId}`), `system.naming` (`appProject`/`clusterSet`/`hostedClusterName`/`namespace` all = `{groupId}`), `system.labels` from `buildLabels`, `system.giteaExternalUrl`/`system.giteaOwner` from config, `vars: {}`.
- [ ] 3.2 Promote `buildLabels` from private to package-visible.
- [ ] 3.3 Add overloads `String getChartRef(String chartName)` and `String getReleaseName(String groupId)` for use by `OrgBootstrapRoute`.
- [ ] 3.4 Extend the existing `HelmValuesBuilderTest` with a unit case for `buildForOrg("cultura", "gdfkube-cultura")` asserting the output file contents (parse YAML + assert keys).

## 4. New route — OrgBootstrapRoute

- [ ] 4.1 Create `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java`. Source: `kafka:dbz.gdfkube.groups?groupId=gdfkube-camel&autoOffsetReset=earliest&autoCommitEnable=false&allowManualCommit=true`.
- [ ] 4.2 Implement filter: accept `__op ∈ {c, r, u}`; drop `__op=d` with debug log. Apply 60s in-memory dedup cache keyed on `_id`.
- [ ] 4.3 Extract `groupId = node.path("_id").asText()` and `groupRepo = node.path("repo").asText("gdfkube-" + groupId)`.
- [ ] 4.4 Call `GitRepoBootstrapper.ensure(owner, "gdfkube-" + groupId, …)` then `GitRepoBootstrapper.ensure(owner, "gdfkube-orgs", …)`. Audit-emit `create-repo` on each creation.
- [ ] 4.5 Acquire per-repo `ReentrantLock` for `gdfkube-orgs` (mirror `GitPushRoute`'s lock pattern); clone or pull.
- [ ] 4.6 Compute target paths under `<workTree>/orgs/<groupId>/`: `appproject.yaml`, `applicationset.yaml`, `<groupId>-clusterset.yaml`. If all exist → audit-emit `noop` and return without rendering.
- [ ] 4.7 Otherwise call `HelmTemplateRunner.render` for `argocd-org` and `rhacm-org`, both into a single `outputDir`, with values from `helmValuesBuilder.buildForOrg(groupId, groupRepo)`.
- [ ] 4.8 Concatenate the two `rhacm-org` template outputs (ManagedClusterSet + ManagedClusterSetBinding) into one `<groupId>-clusterset.yaml` separated by `---` (inline `Files.readAllBytes` + concat + write).
- [ ] 4.9 Copy ONLY the missing files into `<workTree>/orgs/<groupId>/`. Do not overwrite existing files.
- [ ] 4.10 Commit with author `gdfkube-camel <camel@gdfkube.gov.br>` and message `[gdfkube] GROUP-{groupId}: bootstrap org manifests`; push.
- [ ] 4.11 Audit-emit `bootstrap` with `{groupId, files: [...added paths...]}`.
- [ ] 4.12 Manual Kafka offset commit at the end of the unit of work (mirror `RequestRouterRoute.commitKafkaOffset`).
- [ ] 4.13 Wire `errorHandler(deadLetterChannel("kafka:dlq.gdfkube.groups"))` with the standard 3 redeliveries / 1s/5s/25s backoff and the 9 mandatory DLQ context headers per `kafka-broker-stack`.

## 5. Tests

- [ ] 5.1 Create `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/routes/OrgBootstrapIntegrationTest.java`. Mirror `PipelineIntegrationTest.MockProfile` (`app.git.provider=mock`). Inject `MockGitProvider`. Use `AdviceWith` to swap the Kafka source on `org-bootstrap` for a `seda:` source.
- [ ] 5.2 Test `firstEvent_bootstrapsBothReposAndWritesAllFour`: send a group create event for `_id=cultura`, `repo=gdfkube-cultura`. Assert per-org repo `gdfkube-cultura` created, central `gdfkube-orgs` created, single commit on `gdfkube-orgs` containing exactly `orgs/cultura/{appproject.yaml, applicationset.yaml, cultura-clusterset.yaml}`, commit message matches `[gdfkube] GROUP-cultura: bootstrap org manifests`.
- [ ] 5.3 Test `secondEvent_idempotentNoop`: replay the same event. Assert no second commit, no repo recreate, audit emit shows `noop`.
- [ ] 5.4 Test `partialState_onlyMissingFilesPushed`: pre-populate `gdfkube-orgs` with `orgs/cultura/appproject.yaml` only, send the event. Assert commit contains `applicationset.yaml` and `cultura-clusterset.yaml` only; existing `appproject.yaml` untouched.
- [ ] 5.5 Test `existingPerOrgRepo_centralRepoStillBootstraps`: pre-create `gdfkube-cultura` (mirrors `goldenPath_existingRepoIsNotRecreated`); assert central repo + manifests still get created.
- [ ] 5.6 Test `deleteEvent_dropped`: send `__op=d`; assert no clone, no commit, no DLQ message.
- [ ] 5.7 Test `replayWithinTtl_dedupedByCache`: send the same event twice within 60s; assert exactly one commit (suppressed by dedup cache, not by file-exists check).
- [ ] 5.8 Test `helmRenderFailure_dlq`: make `HelmTemplateRunner` throw; assert message lands on `dlq.gdfkube.groups` with the 9 mandatory headers.

## 6. Spec updates

- [ ] 6.1 In `openspec/specs/camel-orchestrator-stack/spec.md`, modify "Eight Camel routes SHALL be defined per the topology" to be 9 routes; add the `org-bootstrap` row to the table; update the consumer/offset list to include `org-bootstrap`; update the registration scenario from 8 to 9 route IDs.
- [ ] 6.2 In `openspec/specs/camel-orchestrator-stack/spec.md`, add the new requirements: "org-bootstrap SHALL idempotently provision per-org GitOps content from group events", "Reusable beans SHALL back the request and org-bootstrap pipelines", "HelmValuesBuilder SHALL produce values for org-bootstrap charts" (content per the change's `specs/camel-orchestrator-stack/spec.md` delta).
- [ ] 6.3 In `openspec/specs/debezium-connect-stack/spec.md`, modify the requirement "Connector SHALL emit CDC events from gdfkube.requests and gdfkube.forms": rename header to include `gdfkube.groups`; update body to list the third collection/topic; update `collection.include.list` value; add scenarios for group `op=c` and group snapshot `op=r`.
- [ ] 6.4 Run `openspec validate camel-orchestrator-stack` and `openspec validate debezium-connect-stack`; confirm both pass.

## 7. End-to-end + verification

- [ ] 7.1 From `gdfkube-src/gdfkube-camel/`: run `./mvnw test`; confirm full Camel test suite green including `OrgBootstrapIntegrationTest` and unchanged `PipelineIntegrationTest`.
- [ ] 7.2 From `gdfkube-src/gdfkube-camel/`: run `./mvnw -DskipITs=false verify`; confirm `AppStartupIT` passes with all 9 routes reporting `Started`.
- [ ] 7.3 From `gdfkube-src/gdfkube-itsm/server/`: run `npm test`; confirm green (no backend change here; sanity check only).
- [ ] 7.4 Restart Debezium connector with the updated config (curl PUT against the Connect REST API as the existing bootstrap script does). From `kafka-console-consumer`, confirm the snapshot replay emits `op=r` events for any pre-existing groups on `dbz.gdfkube.groups`.
- [ ] 7.5 From the SPA, create a group "Cultura". Within seconds confirm: `gdfkube-cultura` and `gdfkube-orgs` repos exist in Gitea; `gdfkube-orgs` contains `orgs/cultura/{appproject.yaml, applicationset.yaml, cultura-clusterset.yaml}`; `gdfkube.audit_log` has rows for `create-repo` (×2) and `bootstrap`.
- [ ] 7.6 Re-trigger by editing the group's `fullName` and saving. Confirm no second commit on `gdfkube-orgs` and audit shows `noop`.
- [ ] 7.7 Run `pre-commit run --all-files` (per CLAUDE.md) before committing.
