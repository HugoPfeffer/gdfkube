# Harden OrgBootstrapRoute Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Apply five post-merge audit fixes to `OrgBootstrapRoute` and `HelmValuesBuilder` — onCompletion cleanup, dedup-after-success, `op==null` rejection, scoped temp paths, and removal of the dead `groupRepo` argument.

**Architecture:** Surgical edits inside `gdfkube-src/gdfkube-camel`. No new beans, no new routes, no Kafka topic changes, no MongoDB schema changes, no Helm value changes. Behavior changes are limited to the failure path (dedup) and the malformed-message path (drop with WARN).

**Tech Stack:** Apache Camel 4.x on Quarkus, JUnit 5, Mockito, Testcontainers, WireMock.

---

## Task 1: Pre-flight verification

- [ ] **Step 1:** Run `git log --oneline openspec/changes/archive | grep unify-gitea-repo-naming` and confirm the change is archived. If not, stop and reorder.
- [ ] **Step 2:** Open `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java`; grep for `getRepoName(`. Must be present from the prior change.
- [ ] **Step 3:** Open `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java`; re-locate the five audit sites — header check (~lines 75-87), dedup put (~line 109), `node.path("repo")` read (~line 102), `buildForOrg(groupId, groupRepo)` call (~line 146), `/tmp/...` outputDir (~line 147). Note any drift from the design's line numbers and update the design if needed.

## Task 2: `HelmValuesBuilder.buildForOrg` — drop `groupRepo`, scoped temp file

- [ ] **Step 1:** In `HelmValuesBuilder.java`, change the method signature from `public String buildForOrg(String groupId, String groupRepo)` to `public String buildForOrg(String groupId)`. Save.
- [ ] **Step 2:** In the same method, delete any line referencing `groupRepo` inside the body (it is currently unused — verify by `grep groupRepo HelmValuesBuilder.java` returning no hits after).
- [ ] **Step 3:** Replace the path construction:
  - From: `String valuesPath = "/tmp/" + groupId + "-bootstrap-values.yaml";`
  - To: `Path valuesPath = Files.createTempFile("bootstrap-" + groupId + "-", ".yaml");`
  - Update the `Files.writeString(...)` call site to use the new `Path`, and `return valuesPath.toString();` at the end.
- [ ] **Step 4:** Open `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/bean/HelmValuesBuilderTest.java`. Drop the second argument from every call to `buildForOrg(...)`. Run the file in your IDE / compile to verify no other call sites break.
- [ ] **Step 5:** Replace the exact-path assertion. Was: `assertThat(path).isEqualTo("/tmp/cultura-bootstrap-values.yaml")`. New: `assertThat(Path.of(path).getFileName().toString()).matches("bootstrap-cultura-.*\\.yaml")` and `assertThat(Path.of(path).getParent()).isEqualTo(Path.of(System.getProperty("java.io.tmpdir")))`.
- [ ] **Step 6:** Add a new test `buildForOrg_concurrent_returnsDistinctPaths`:
  - Spawn 2 threads each calling `builder.buildForOrg("cultura")`.
  - `CountDownLatch` start gate so both call near-simultaneously.
  - Collect both returned paths; assert they are distinct strings.
  - Cleanup: `Files.deleteIfExists(...)` for both.
- [ ] **Step 7:** `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=HelmValuesBuilderTest`. Green.
- [ ] **Step 8:** Commit: `harden HelmValuesBuilder.buildForOrg: drop dead groupRepo, scope temp file`.

## Task 3: `OrgBootstrapRoute` — `op == null` rejection

- [ ] **Step 1:** In `OrgBootstrapRoute.configure()`, inside the leading `.process(exchange -> { ... })`, after resolving `op` from `__op` / `op` headers, insert:
  ```java
  if (op == null) {
      LOG.warnf("groups event missing __op/op header, dropping: %s",
                exchange.getIn().getBody(String.class));
      exchange.setProperty("accepted", false);
      return;
  }
  ```
  Place this **before** the existing `if ("d".equals(op))` branch.
- [ ] **Step 2:** In `OrgBootstrapRouteTest`, add a unit test `noOpHeader_isDroppedWithoutDlqOrCommitAndPush`:
  - Build an `Exchange` with body `{"_id":"cultura"}` and neither `__op` nor `op` headers.
  - Run through the route via `ProducerTemplate`.
  - Verify `gitProvider.commitAndPush(...)` was never invoked (`Mockito.verifyNoInteractions(gitProvider)` or similar).
  - Verify the DLQ producer was never invoked.
  - Verify `kafkaManualCommit.commitSync()` invoked exactly once.
- [ ] **Step 3:** `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=OrgBootstrapRouteTest`. Green.
- [ ] **Step 4:** Commit: `OrgBootstrapRoute: drop events with missing op header (WARN + ack)`.

## Task 4: `OrgBootstrapRoute` — scoped temp `outputDir` + `.onCompletion()` cleanup

- [ ] **Step 1:** Add imports to `OrgBootstrapRoute.java` if not present: `java.nio.file.Files`, `java.nio.file.Path`, `java.util.Comparator`, `java.util.stream.Stream`.
- [ ] **Step 2:** In `processGroupEvent`, replace
  ```java
  String outputDir = "/tmp/" + groupId + "-bootstrap-out";
  ```
  with
  ```java
  Path outputDirPath = Files.createTempDirectory("bootstrap-" + groupId + "-");
  String outputDir = outputDirPath.toString();
  exchange.setProperty("outputDir", outputDir);
  ```
- [ ] **Step 3:** In `configure()`, insert an `.onCompletion()...end()` block immediately after `.routeId(ROUTE_ID)` and before the first `.process(...)`:
  ```java
  .onCompletion()
      .process(exchange -> {
          String outputDir = exchange.getProperty("outputDir", String.class);
          if (outputDir == null) return;
          Path dir = Path.of(outputDir);
          if (!Files.exists(dir)) return;
          try (Stream<Path> walk = Files.walk(dir)) {
              walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                  try { Files.delete(p); }
                  catch (IOException e) {
                      LOG.warnf("Failed to clean up %s: %s", p, e.getMessage());
                  }
              });
          }
      })
  .end()
  ```
- [ ] **Step 4:** In `PipelineIntegrationTest` (or `OrgBootstrapIntegrationTest` if it exists; otherwise add a new `OrgBootstrapCleanupIT`), add a scenario `outputDir_isCleanedUpAfterSuccess`:
  - Trigger a normal `op=c` exchange end-to-end.
  - After completion, `Files.list(Path.of(System.getProperty("java.io.tmpdir")))` filtered to `startsWith("bootstrap-cultura-")` must be empty.
- [ ] **Step 5:** `./mvnw -pl gdfkube-src/gdfkube-camel test`. Green.
- [ ] **Step 6:** Commit: `OrgBootstrapRoute: scope outputDir per exchange, cleanup on completion`.

## Task 5: `OrgBootstrapRoute` — dedup-after-success

- [ ] **Step 1:** In `processGroupEvent`, **delete** the line `dedupCache.put(groupId, System.currentTimeMillis());` that currently sits immediately after the `containsKey` check. Keep the `evictExpired()` + `containsKey` block intact.
- [ ] **Step 2:** Re-insert the `dedupCache.put(groupId, System.currentTimeMillis());` call immediately after `gitProvider.commitAndPush(workTree, addedPaths, message, GitAuthor.CAMEL);` and **before** the `auditInterceptor.emit(ROUTE_ID, groupId, 0, "bootstrap", ...)` call.
- [ ] **Step 3:** Open `PipelineIntegrationTest` (or the org-bootstrap integration test). Add `helmFailure_leavesDedupCacheEmpty`:
  - Configure `helmTemplateRunner` mock to throw on first invocation.
  - Send one `op=c` for group `cultura`.
  - Wait for redeliveries to exhaust + DLQ landing.
  - Assert `OrgBootstrapRoute.dedupCache.isEmpty()` (or expose via a package-private getter if not already accessible).
  - Send a second `op=u` for the same group within 60s; assert it is **not** suppressed (the route invokes `gitProvider.cloneOrPull` again, observable via mock interaction count).
- [ ] **Step 4:** `./mvnw -pl gdfkube-src/gdfkube-camel test`. Green.
- [ ] **Step 5:** Commit: `OrgBootstrapRoute: populate dedupCache only after successful commit-and-push`.

## Task 6: `OrgBootstrapRoute` — drop `node.path("repo")`

- [ ] **Step 1:** In `processGroupEvent`, delete:
  ```java
  String groupRepo = node.path("repo").asText("gdfkube-" + groupId);
  ```
- [ ] **Step 2:** Update the call site:
  - From: `String valuesPath = helmValuesBuilder.buildForOrg(groupId, groupRepo);`
  - To: `String valuesPath = helmValuesBuilder.buildForOrg(groupId);`
- [ ] **Step 3:** `grep -n groupRepo gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java` — must return no hits.
- [ ] **Step 4:** `./mvnw -pl gdfkube-src/gdfkube-camel test`. Green.
- [ ] **Step 5:** Commit: `OrgBootstrapRoute: stop reading node.repo (canonical name from HelmValuesBuilder)`.

## Task 7: Cross-check + verify

- [ ] **Step 1:** `./mvnw -pl gdfkube-src/gdfkube-camel test` — full module green.
- [ ] **Step 2:** `openspec validate harden-org-bootstrap-route` — passes.
- [ ] **Step 3:** Manual smoke (devcontainer Kafka stack):
  - Publish a malformed event to `dbz.gdfkube.groups` with no `__op`/`op` headers. Tail logs for the WARN. Confirm `dlq.gdfkube.groups` did **not** receive it. Confirm consumer offset advanced (`kafka-consumer-groups.sh --describe --group gdfkube-camel`).
  - Publish a normal `op=c` for a fresh group. After the exchange completes, run `ls $TMPDIR/bootstrap-*` — must be empty.
  - Force a helm failure (point chart catalog at a bad chart). Verify the message hits `dlq.gdfkube.groups`; verify the next `op=u` for the same group **is** processed (not dedup-suppressed).
- [ ] **Step 4:** `pre-commit run --all-files`.
- [ ] **Step 5:** Open PR. Reference the audit items in the description (H-4, H-5, H-11, M-1, M-4).
