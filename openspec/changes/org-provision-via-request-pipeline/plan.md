# Org Provisioning via Request Pipeline — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Create org repos and ArgoCD scaffolding only when an ITSM request is provisioned, never during deploy-time seeding.

**Architecture:** Re-point the existing `org-bootstrap` Camel route from `kafka:dbz.gdfkube.groups` to `direct:org-bootstrap`, invoked by the request pipeline's `repo-bootstrap` step (keyed by `requesterGroupName`). Remove the groups CDC source (Debezium include-list, pre-image, `dbz.gdfkube.groups` topic). Group seeding into MongoDB stays for the ITSM SPA.

**Tech Stack:** Quarkus + Apache Camel (Java), Debezium MongoDB connector, Kafka (KRaft), Helm; tests with JUnit + camel-quarkus-junit5 + Mockito.

---

## Task 1: Re-point org-bootstrap to a direct sub-route

- [ ] **Step 1:** In `OrgBootstrapIntegrationTest.java`, change the harness to send to `direct:org-bootstrap` with the `org` exchange property set (drop the group-CDC JSON body and any `replaceFromWith` of a Kafka source). Run the test — it MUST fail (route still reads a group body / Kafka source).
- [ ] **Step 2:** In `OrgBootstrapRoute.java`, change `from("kafka:dbz.gdfkube.groups"...)` to `from("direct:org-bootstrap")`; remove the Kafka consumer query options.
- [ ] **Step 3:** Remove `op`-header handling: delete the accept/`__op` processor, the `choice()/otherwise()` drop branch, and the trailing `commitKafkaOffset(...)` step.
- [ ] **Step 4:** In `processGroupEvent` (rename to `processOrgEvent`), read `String org = exchange.getProperty("org", String.class)` instead of parsing `_id` from the body. Replace every `groupId` usage (dedup key, lock, temp dir, `buildForOrg`, `orgs/<org>/` paths, commit message) with `org`.
- [ ] **Step 5:** Keep unchanged: the `ReentrantLock`, `.onCompletion()` `outputDir` cleanup, 60s `Clock` dedup TTL, missing-file idempotency, and `deadLetterChannel("kafka:dlq.gdfkube.groups")`. Run `OrgBootstrapIntegrationTest` — it MUST pass.
- [ ] **Step 6:** Commit: `refactor(camel): drive org-bootstrap via direct:org-bootstrap keyed by org`.

## Task 2: Invoke org-bootstrap from repo-bootstrap

- [ ] **Step 1:** In `PipelineIntegrationTest.java`, add an assertion that provisioning a request commits `orgs/{org}/appproject.yaml`, `orgs/{org}/applicationset.yaml`, `orgs/{org}/{org}-clusterset.yaml` to `gdfkube-orgs` before the per-request workloads under `clusters/{release}/`. Run — it MUST fail.
- [ ] **Step 2:** In `RepoBootstrapRoute.java`, after `gitRepoBootstrapper.ensure(...)` for `gdfkube-{org}`, add `exchange.setProperty("org", event.requesterGroupName)` then `.to("direct:org-bootstrap")`.
- [ ] **Step 3:** Run `PipelineIntegrationTest` — it MUST pass. Confirm ordering (scaffolding committed before workloads pushed).
- [ ] **Step 4:** Commit: `feat(camel): ensure org scaffolding from repo-bootstrap before workload push`.

## Task 3: Remove the groups CDC source

- [ ] **Step 1:** Edit `debezium/connector-config.json`: `collection.include.list` → `gdfkube.requests,gdfkube.forms`.
- [ ] **Step 2:** Edit `platform/manifests/init-jobs/configmaps.yaml`: update the connector `collection.include.list` to match; remove `ensurePreImage('groups')`; remove `create_topic "dbz.gdfkube.groups"`. Leave `dlq.gdfkube.groups`, group seeding, and the group index intact.
- [ ] **Step 3:** Edit `kafka/init-topics.sh`: remove the `dbz.gdfkube.groups` topic; keep `dlq.gdfkube.groups`.
- [ ] **Step 4:** Update `debezium/README.md` (drop the `dbz.gdfkube.groups` row).
- [ ] **Step 5:** Grep to confirm `dbz.gdfkube.groups` appears nowhere except history; `collection.include.list` no longer contains `gdfkube.groups`.
- [ ] **Step 6:** Commit: `chore(infra): stop capturing gdfkube.groups; drop dbz.gdfkube.groups topic`.

## Task 4: Verify

- [ ] **Step 1:** From `gdfkube-src/gdfkube-camel/`, run `mvn -q test` (return the command to the user if Maven/JDK is absent in the devcontainer). All green; no test references a live `kafka:dbz.gdfkube.groups` consumer.
- [ ] **Step 2:** Run `pre-commit run --all-files` (trufflehog) before pushing.
- [ ] **Step 3:** (Cluster, if available) Fresh bootstrap → no `gdfkube-{org}` repos and no `gdfkube-orgs/orgs/*`, discovery ApplicationSet clean; then submit + approve an ITSM request and confirm scaffolding + workloads appear and ArgoCD syncs cleanly.
