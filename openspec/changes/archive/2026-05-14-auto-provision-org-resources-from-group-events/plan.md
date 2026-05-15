# Auto-provision org resources from group events — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Wire the existing `argocd-org` and `rhacm-org` Helm charts to MongoDB group lifecycle events through a new Camel route `OrgBootstrapRoute`, so creating a group in the SPA idempotently produces the per-org Gitea repo and the three target manifests under `orgs/<groupId>/` in the central `gdfkube-orgs` repo.

**Architecture:** New route consumes `dbz.gdfkube.groups` (added to the existing Debezium connector). Two beans extracted from existing routes (`GitRepoBootstrapper` from `RepoBootstrapRoute`, `HelmTemplateRunner` from `HelmRenderRoute`) are reused so the new route does not duplicate logic. `HelmValuesBuilder` gains `buildForOrg(...)` alongside the existing `build(RequestEvent)`. Idempotency is git-file-exists at the destination repo — manual edits in `gdfkube-orgs` are preserved. DLQ piggy-backs on the existing `DlqHandlerRoute` via the new topic `dlq.gdfkube.groups`. Strictly rendered-manifests scope; no demo-bootstrap (top-level ArgoCD root) work.

**Tech Stack:** Quarkus 3.16.3 / Camel 4.6.0 (Java 21), Apache Kafka, MongoDB + Debezium MongoDB Source Connector, Helm 3.16.x, Gitea + JGit; Failsafe + `@QuarkusIntegrationTest` + Camel `AdviceWith` for tests.

---

## Task 1: Mongo + Debezium plumbing

- [ ] **Step 1:** Open `gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js`. Add an idempotent `db.runCommand({collMod: "groups", changeStreamPreAndPostImages: {enabled: true}})` block (mirror the existing block for `requests`/`forms`). Wrap in a `try/catch` that swallows the "collection already configured" error so re-runs stay green.
- [ ] **Step 2:** Open `gdfkube-src/gdfkube-infra/debezium/connector-config.json`. Change `collection.include.list` from `gdfkube.requests,gdfkube.forms` to `gdfkube.requests,gdfkube.forms,gdfkube.groups`.
- [ ] **Step 3:** Locate the connector registration script (likely `gdfkube-src/gdfkube-infra/debezium/register-connector.sh`); confirm it PUTs config (idempotent register pattern) so the updated `collection.include.list` lands on next stack up.
- [ ] **Step 4:** Run `docker compose down -v && docker compose up -d gdfkube-debezium-init` (or the equivalent in the dev workflow). Verify `dbz.gdfkube.groups` appears in `kafka-topics --list` and seeded groups produce `op=r` events.

## Task 2: Extract GitRepoBootstrapper

- [ ] **Step 1:** Create `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/GitRepoBootstrapper.java` as a `@ApplicationScoped` bean. Inject `GitProvider`. Implement `void ensure(String owner, String repoName, String description)` containing exactly the `if (!gitProvider.repoExists(owner, repoName)) { gitProvider.createRepo(owner, repoName, new RepoOptions(description)); }` logic from `RepoBootstrapRoute`.
- [ ] **Step 2:** Open `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/RepoBootstrapRoute.java`. Replace the inline `repoExists`/`createRepo` block with a `bean(GitRepoBootstrapper.class, "ensure")` call (or equivalent processor that resolves the args from headers/exchange). Keep the audit emit and stage update in the route — they are request-pipeline concerns.
- [ ] **Step 3:** Run `./mvnw -pl gdfkube-src/gdfkube-camel test`. Confirm `PipelineIntegrationTest.goldenPath_existingRepoIsNotRecreated` and the rest of the existing suite still pass with no edits.

## Task 3: Extract HelmTemplateRunner

- [ ] **Step 1:** Create `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmTemplateRunner.java` as a `@ApplicationScoped` bean. Implement `List<Path> render(String chartRef, String releaseName, String valuesPath, String outputDir)`. Move the `ProcessBuilder` invocation from `HelmRenderRoute.runHelmTemplate(...)` verbatim. Resolve chart at `/opt/charts/{chartRef}`. Use `--include-crds`. On non-zero exit, throw `RuntimeException` carrying the captured stderr.
- [ ] **Step 2:** Open `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/HelmRenderRoute.java`. Delete the private `runHelmTemplate(...)` method. Replace the call site with `helmTemplateRunner.render(...)`. No other behavior change.
- [ ] **Step 3:** Run `./mvnw -pl gdfkube-src/gdfkube-camel test`. Confirm green.

## Task 4: HelmValuesBuilder.buildForOrg

- [ ] **Step 1:** Open `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java`. Promote `buildLabels(...)` from `private` to package-private (drop the modifier).
- [ ] **Step 2:** Add `public String buildForOrg(String groupId, String groupRepo) throws IOException`. Build a `Map<String,Object>` with: `meta = { requestId: "bootstrap-"+groupId, formId: "org-bootstrap", org: groupId, email: null, submittedAt: Instant.now().toString(), correlationId: "bootstrap-"+groupId }`; `system.naming = { appProject: groupId, clusterSet: groupId, hostedClusterName: groupId, namespace: groupId }`; `system.labels = buildLabels(groupId, "bootstrap-"+groupId)`; `system.giteaExternalUrl`/`system.giteaOwner` from injected config; `vars = Map.of()`. Serialize with the existing YAML mapper to `/tmp/{groupId}-bootstrap-values.yaml`. Return the path string.
- [ ] **Step 3:** Add overloads `String getChartRef(String chartName)` returning the chart name as-is (e.g., `infra/argocd-org` for `argocd-org`) and `String getReleaseName(String groupId)` returning `groupId + "-bootstrap"`.
- [ ] **Step 4:** Open `HelmValuesBuilderTest`. Add a `buildForOrg_writesCanonicalValues` test: call `buildForOrg("cultura", "gdfkube-cultura")`, parse the resulting file with the existing YAML reader, assert `meta.requestId == "bootstrap-cultura"`, `meta.formId == "org-bootstrap"`, `system.naming.appProject == "cultura"`, `system.naming.clusterSet == "cultura"`, all 6 labels present.
- [ ] **Step 5:** Run `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=HelmValuesBuilderTest`. Confirm green.

## Task 5: OrgBootstrapRoute scaffold + filter + dedup

- [ ] **Step 1:** Create `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java` extending `RouteBuilder`. Inject `GitRepoBootstrapper`, `HelmTemplateRunner`, `HelmValuesBuilder`, `GitProvider`, `AuditEmitter`, the configured Gitea owner, and the configured external URL.
- [ ] **Step 2:** Define route id `org-bootstrap`. Source: `from("kafka:dbz.gdfkube.groups?groupId=gdfkube-camel&autoOffsetReset=earliest&autoCommitEnable=false&allowManualCommit=true")`.
- [ ] **Step 3:** Add filter on header `__op` ∈ `{c, r, u}` — drop `d` with a `log("groups.delete dropped: ${body}")` at debug level.
- [ ] **Step 4:** Add a route-local 60s in-memory dedup cache (Caffeine `Cache<String, Boolean>` with `expireAfterWrite(Duration.ofSeconds(60))`) keyed on `_id` extracted from the JSON body. Suppress the unit of work with a manual offset commit when the cache hit is positive.

## Task 6: OrgBootstrapRoute idempotent bootstrap body

- [ ] **Step 1:** In the route processor, parse JSON body to extract `groupId = node.path("_id").asText()` and `groupRepo = node.path("repo").asText("gdfkube-" + groupId)`.
- [ ] **Step 2:** Call `gitRepoBootstrapper.ensure(owner, "gdfkube-" + groupId, "GitOps manifests for " + groupId)`. On creation, emit `auditEmitter.emit("create-repo", {repo: ...})`.
- [ ] **Step 3:** Call `gitRepoBootstrapper.ensure(owner, "gdfkube-orgs", "Org bootstrap manifests rendered by gdfkube-camel")`. On creation, emit `create-repo`.
- [ ] **Step 4:** Acquire a per-repo `ReentrantLock` for `gdfkube-orgs` (mirror `GitPushRoute`'s `Map<String, ReentrantLock>`). Inside the lock, call `gitProvider.cloneOrPull(owner, "gdfkube-orgs", "main")` to get the working tree.
- [ ] **Step 5:** Compute target paths: `Path appProj = workTree.resolve("orgs/" + groupId + "/appproject.yaml");` and similarly for `applicationset.yaml` and `<groupId>-clusterset.yaml`. Build a `List<Path> missing` of those that do not exist via `Files.exists`.
- [ ] **Step 6:** If `missing.isEmpty()`: emit `auditEmitter.emit("noop", {groupId})`, commit Kafka offset, return.
- [ ] **Step 7:** Otherwise call `helmTemplateRunner.render(helmValuesBuilder.getChartRef("argocd-org"), helmValuesBuilder.getReleaseName(groupId), helmValuesBuilder.buildForOrg(groupId, groupRepo), "/tmp/" + groupId + "-bootstrap-out")` and again for `rhacm-org`.
- [ ] **Step 8:** Locate the two `rhacm-org` outputs (ManagedClusterSet template + ManagedClusterSetBinding template) under the output dir. Concatenate `Files.readAllBytes` of both with `\n---\n` separator. This becomes the source bytes for the destination `<groupId>-clusterset.yaml`.
- [ ] **Step 9:** For each `Path target` in `missing`, identify the source bytes (the helm output for `appproject.yaml` and `applicationset.yaml`; the concatenated bytes for `<groupId>-clusterset.yaml`) and `Files.write(target, sourceBytes)`. Skip any target not in `missing` (preserves manual edits).
- [ ] **Step 10:** Call `gitProvider.commitAndPush(workTree, addedPaths, "[gdfkube] GROUP-" + groupId + ": bootstrap org manifests", GitAuthor.CAMEL)`.
- [ ] **Step 11:** Emit `auditEmitter.emit("bootstrap", {groupId, files: addedPaths})`.
- [ ] **Step 12:** Manual Kafka offset commit. Mirror `RequestRouterRoute.commitKafkaOffset(exchange)`.

## Task 7: OrgBootstrapRoute error handling

- [ ] **Step 1:** Wire `errorHandler(deadLetterChannel("kafka:dlq.gdfkube.groups").maximumRedeliveries(3).redeliveryDelay(1000).useExponentialBackOff().backOffMultiplier(5.0))` matching the standard pattern from other routes.
- [ ] **Step 2:** Stamp the 9 mandatory DLQ context headers per `kafka-broker-stack` before publishing (reuse the existing `DlqHeaderStamper` if present; otherwise replicate the headers inline).
- [ ] **Step 3:** Confirm the existing `DlqHandlerRoute`'s `dlq.gdfkube.*` multi-pattern subscription will pick up the new topic with no edit.

## Task 8: Integration tests

- [ ] **Step 1:** Create `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/routes/OrgBootstrapIntegrationTest.java` annotated with `@QuarkusTest` and `@TestProfile(MockProfile.class)` (reuse `PipelineIntegrationTest.MockProfile` or a new class with `app.git.provider=mock`). Inject `MockGitProvider`, `CamelContext`, `ProducerTemplate`.
- [ ] **Step 2:** Use `AdviceWith` to swap the `org-bootstrap` route's Kafka source for a `seda:org-bootstrap-test` source so tests can drive events synchronously via `ProducerTemplate.sendBodyAndHeader(seda, body, "__op", "c")`.
- [ ] **Step 3:** Add `firstEvent_bootstrapsBothReposAndWritesAllFour`: send `op=c` for `_id=cultura`, `repo=gdfkube-cultura`. Assert `mockGitProvider.repoExists(owner, "gdfkube-cultura")` and `…"gdfkube-orgs"`. Assert exactly one commit on `gdfkube-orgs` with files `[orgs/cultura/appproject.yaml, orgs/cultura/applicationset.yaml, orgs/cultura/cultura-clusterset.yaml]`. Assert commit message `[gdfkube] GROUP-cultura: bootstrap org manifests`.
- [ ] **Step 4:** Add `secondEvent_idempotentNoop`: replay the same event after the first; assert exactly one commit total; assert audit emit set contains `noop`.
- [ ] **Step 5:** Add `partialState_onlyMissingFilesPushed`: pre-populate the mock's `gdfkube-orgs` workTree with `orgs/cultura/appproject.yaml`. Send the event. Assert the resulting commit contains exactly `applicationset.yaml` and `cultura-clusterset.yaml` and that `appproject.yaml` bytes are unchanged from the pre-populated value.
- [ ] **Step 6:** Add `existingPerOrgRepo_centralRepoStillBootstraps`: pre-create `gdfkube-cultura` in the mock; send the event; assert `gdfkube-orgs` is created and the three manifests committed.
- [ ] **Step 7:** Add `deleteEvent_dropped`: send `__op=d`; assert `mockGitProvider.commitsFor("gdfkube-orgs")` is empty and no DLQ message landed.
- [ ] **Step 8:** Add `replayWithinTtl_dedupedByCache`: send the same event twice within 60s (with no pre-populate); assert exactly one commit. Distinguish from the file-exists path by inspecting an audit emit counter (the second invocation should emit nothing, not even `noop`).
- [ ] **Step 9:** Add `helmRenderFailure_dlq`: replace `HelmTemplateRunner` with a Mockito stub that throws; send the event; after redelivery exhaustion, assert a message lands on `dlq.gdfkube.groups` with the 9 mandatory headers.
- [ ] **Step 10:** Run `./mvnw -pl gdfkube-src/gdfkube-camel test`. Confirm both `OrgBootstrapIntegrationTest` and the unchanged `PipelineIntegrationTest` pass.
- [ ] **Step 11:** Run `./mvnw -pl gdfkube-src/gdfkube-camel -DskipITs=false verify`. Confirm `AppStartupIT` reports all 9 routes `Started`.

## Task 9: Spec updates

- [ ] **Step 1:** Open `openspec/specs/camel-orchestrator-stack/spec.md`. Apply the MODIFIED change to "Eight Camel routes …": route count 8 → 9; append the `org-bootstrap` row; expand the consumer/offset list; update the registration scenario to expect 9 route IDs (per this change's `specs/camel-orchestrator-stack/spec.md`).
- [ ] **Step 2:** Append the three new requirements from this change's spec delta: "org-bootstrap SHALL idempotently provision per-org GitOps content from group events", "Reusable beans SHALL back the request and org-bootstrap pipelines", "HelmValuesBuilder SHALL produce values for org-bootstrap charts". Each with their scenarios.
- [ ] **Step 3:** Open `openspec/specs/debezium-connect-stack/spec.md`. Rename the requirement header to include `gdfkube.groups`; update the body and `collection.include.list` value; add the two new scenarios (group `op=c` and group snapshot `op=r`).
- [ ] **Step 4:** Run `openspec validate camel-orchestrator-stack` and `openspec validate debezium-connect-stack`. Confirm both pass.

## Task 10: End-to-end verification

- [ ] **Step 1:** From repo root: `docker compose down -v && docker compose up -d`. Wait for `gdfkube-camel` to report healthy. Tail `docker compose logs -f gdfkube-camel | grep org-bootstrap` to watch route activity.
- [ ] **Step 2:** From the SPA, log in as admin, click "+" New group, type "Cultura", click Create. Within ~10 seconds:
  - `kafka-console-consumer --topic dbz.gdfkube.groups --from-beginning` shows the unwrapped `op=c` event.
  - Gitea has new repos `gdfkube-cultura` and `gdfkube-orgs`.
  - `gdfkube-orgs` contains `orgs/cultura/appproject.yaml`, `orgs/cultura/applicationset.yaml`, `orgs/cultura/cultura-clusterset.yaml`.
  - `mongo gdfkube --eval 'db.audit_log.find({groupId: "cultura"}).pretty()'` shows entries for `create-repo` (×2) and `bootstrap`.
- [ ] **Step 3:** From the SPA, edit Cultura's Full name and click Save. Within seconds confirm: no second commit on `gdfkube-orgs` (`git log` shows the same head); `audit_log` shows a `noop` entry for `cultura`.
- [ ] **Step 4:** Run `pre-commit run --all-files`. Confirm pass.
- [ ] **Step 5:** Commit with imperative message, e.g., `add OrgBootstrapRoute and group-event Debezium trigger`.
