> **Branch note:** This change was implemented on a `main`-based worktree. The OpenShift platform tree (`gdfkube-src/gdfkube-infra/platform/`, incl. `init-jobs/configmaps.yaml`) exists **only on `main-openshift`**, so the configmaps.yaml mirror edits (2.2, 3.2) could not be applied here and are deferred to a `main-openshift` follow-up (see below).

## 1. Camel: re-point org-bootstrap to the request pipeline

- [x] 1.1 In `OrgBootstrapRoute.java`, source changed from `kafka:dbz.gdfkube.groups` to `direct:org-bootstrap`; Kafka consumer options dropped.
- [x] 1.2 Removed `op`-header filtering, the `choice()`/`otherwise()` drop branch, and `commitKafkaOffset`.
- [x] 1.3 Org id read from the `org` exchange property; dedup cache / repo lock / temp dir / `buildForOrg` / `orgs/<org>/` paths / commit message keyed on it. `.onCompletion()` cleanup, `ReentrantLock`, 60s `Clock` TTL, idempotent missing-file check, and `deadLetterChannel("kafka:dlq.gdfkube.groups")` unchanged.
- [x] 1.4 In `RepoBootstrapRoute.java`, after `gitRepoBootstrapper.ensure(...)`, set `org` from `event.requesterGroupName` and `.to("direct:org-bootstrap")`.
- [x] 1.5 Ordering verified: `git-push` calls `repo-bootstrap` (→ `org-bootstrap`) before writing `clusters/{release}/`.

## 2. Debezium: stop capturing the groups collection

- [x] 2.1 `debezium/connector-config.json`: `collection.include.list` → `gdfkube.requests,gdfkube.forms`.
- [ ] 2.2 **(main-openshift follow-up)** `platform/manifests/init-jobs/configmaps.yaml`: update the connector `collection.include.list`, remove `ensurePreImage('groups')`. Leave group seeding intact. *Not applicable on this `main`-based worktree — file absent.*
- [x] 2.3 `debezium/README.md`: dropped the `dbz.gdfkube.groups` row. Also fixed `kafka/README.md` consumer-group topic list.

## 3. Kafka: remove the dbz.gdfkube.groups source topic

- [x] 3.1 `kafka/init-topics.sh`: removed `dbz.gdfkube.groups`; kept `dlq.gdfkube.groups`; updated count comment (14→13).
- [ ] 3.2 **(main-openshift follow-up)** `platform/manifests/init-jobs/configmaps.yaml`: remove the `create_topic "dbz.gdfkube.groups"` line; keep `dlq.gdfkube.groups`. *Not applicable on this `main`-based worktree — file absent.*

## 4. Tests

- [x] 4.1 `OrgBootstrapIntegrationTest.java` drives `direct:org-bootstrap` via the `org` property; `clearDedupCacheForTesting()` retained; path-preserving `MockGitProvider` assertions retained.
- [x] 4.2 Dedup/replay/helm-failure tests invoke via the `org` property; op-filtering tests (`deleteEvent_dropped`, `missingOpHeader_droppedWithoutCommit`) deleted.
- [x] 4.3 `PipelineIntegrationTest.goldenPath_provisioningAlsoCreatesOrgScaffolding` asserts the pipeline commits `orgs/{org}/{appproject,applicationset,{org}-clusterset}.yaml` to `gdfkube-orgs`.
- [x] 4.4 No test references a live `kafka:dbz.gdfkube.groups` consumer.

## 5. Verification

- [x] 5.1 `./mvnw -o test` (JDK 21 at `/home/node/.local/jdk`): `Tests run: 61, Failures: 0, Errors: 0, Skipped: 0` — BUILD SUCCESS.
- [x] 5.2 `dbz.gdfkube.groups` gone from `connector-config.json` and `init-topics.sh`; `collection.include.list` no longer contains `gdfkube.groups`; `dlq.gdfkube.groups` retained.
- [x] 5.3 `pre-commit run --all-files` → TruffleHog Passed.
- [ ] 5.4 (Cluster, if available) Fresh bootstrap → no `gdfkube-{org}` repos and no `gdfkube-orgs/orgs/*`; then submit + approve an ITSM request and confirm scaffolding + workloads appear and ArgoCD syncs cleanly.

## 6. main-openshift follow-up (configmaps.yaml mirror)

- [x] 6.1 Applied on `main-openshift` to `gdfkube-src/gdfkube-infra/platform/manifests/init-jobs/configmaps.yaml`: drop `gdfkube.groups` from the embedded `collection.include.list`, remove `ensurePreImage('groups')`, and remove the `create_topic "dbz.gdfkube.groups"` line. Keep `dlq.gdfkube.groups`, the group seeding, and the group index. This eliminates the source/mirror drift when the change merges to the deployment branch.
