# Make OrgBootstrapIntegrationTest Deterministic — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Make `OrgBootstrapIntegrationTest` pass 7/7 deterministically by
removing the SEDA async race and the cross-test dedup-cache leak, without
changing `OrgBootstrapRoute` production behavior.

**Architecture:** Switch the test route advice from `seda:` to synchronous
`direct:` dispatch (so `producer.send` blocks through full route completion),
add one test-only `clearDedupCacheForTesting()` seam on the
`@ApplicationScoped` route called per-test from `@BeforeEach`, and verify the
helm-failure path via a captured `mock:dlq-capture` endpoint instead of a
racing Mockito `verify`. Patterns mirror `ApprovalLoopGuardTest` (sync
`direct:`) and `DlqFlowTest` (DLQ capture).

**Tech Stack:** Quarkus, Apache Camel (`camel-quarkus-junit5`: `AdviceWith`,
`ProducerTemplate`, `MockEndpoint`, `@EndpointInject`), JUnit 5, Mockito. No
new dependencies.

**Key files:**
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java`
- `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/routes/OrgBootstrapIntegrationTest.java`
- Reference (do not modify): `DlqFlowTest.java`, `ApprovalLoopGuardTest.java`

**Baseline (red):** before changes, `mvn -q -Dtest=OrgBootstrapIntegrationTest
test` ≈ 6 failing of 7. The 7 tests are: `firstEvent_bootstrapsBothReposAndWritesAllFour`,
`secondEvent_idempotentNoop`, `partialState_onlyMissingFilesPushed`,
`existingPerOrgRepo_centralRepoStillBootstraps`, `deleteEvent_dropped`,
`replayWithinTtl_dedupedByCache`, `helmRenderFailure_dlq`.

---

## Task 1: Add the test-only dedup-reset seam to OrgBootstrapRoute

- [ ] **Step 1:** Open
  `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java`.
- [ ] **Step 2:** Immediately after `evictExpired()` (around line 225), add the
  single seam method — package-private, self-documenting name:

  ```java
  /** Test-only: clears dedup state so each test starts isolated. Not called by production code. */
  void clearDedupCacheForTesting() {
      dedupCache.clear();
  }
  ```

- [ ] **Step 3:** Verify nothing else changed: `git diff -- OrgBootstrapRoute.java`
  shows only the added method (no edits to `configure()`, `processGroupEvent`,
  `TTL_MS`, `deadLetterChannel`, or orchestration).
- [ ] **Step 4:** Compile only: `mvn -q -pl gdfkube-src/gdfkube-camel
  -am test-compile` (from repo root) — expect success.
- [ ] **Commit:** `test(camel): add test-only dedup-reset seam to OrgBootstrapRoute`

## Task 2: Synchronous `direct:` dispatch (FR1)

- [ ] **Step 1:** Open
  `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/routes/OrgBootstrapIntegrationTest.java`.
- [ ] **Step 2:** In `adviceRoutes()` (line ~65) replace
  `route.replaceFromWith("seda:org-bootstrap-test")` with
  `route.replaceFromWith("direct:org-bootstrap-test")`.
- [ ] **Step 3:** In `sendGroupEvent(...)` (line ~232) replace
  `producer.send("seda:org-bootstrap-test", exchange -> {` with
  `producer.send("direct:org-bootstrap-test", exchange -> {`.
- [ ] **Step 4:** Run `mvn -q -Dtest=OrgBootstrapIntegrationTest test`
  (from `gdfkube-src/gdfkube-camel`). Expect the positive-path tests
  (`firstEvent_…`, `partialState_…`, `existingPerOrgRepo_…`) to now pass;
  dedup-order-sensitive ones may still fail until Task 3.
- [ ] **Commit:** `test(camel): run org-bootstrap route synchronously via direct:`

## Task 3: Per-test dedup isolation (FR2 / FR4)

- [ ] **Step 1:** Add the route bean injection field next to the existing
  injects (after `MockGitProvider mockGitProvider;`, ~line 58):

  ```java
  @Inject
  OrgBootstrapRoute orgBootstrapRoute;
  ```

- [ ] **Step 2:** In `@BeforeEach resetState()` (line ~70) add, before
  `stubHelmRender();`:

  ```java
  orgBootstrapRoute.clearDedupCacheForTesting();
  ```

- [ ] **Step 3:** Do **not** edit the bodies of
  `replayWithinTtl_dedupedByCache`, `secondEvent_idempotentNoop`, or the
  positive-path tests.
- [ ] **Step 4:** Run `mvn -q -Dtest=OrgBootstrapIntegrationTest test`. Expect
  6/7 now (only `helmRenderFailure_dlq` may still be timing-fragile until
  Task 4). Re-run immediately a 2nd time within 60s — same result (proves
  dedup isolation across runs).
- [ ] **Commit:** `test(camel): reset dedup cache per test for isolation`

## Task 4: DLQ-capture verification for helmRenderFailure_dlq (FR3)

- [ ] **Step 1:** Add imports:
  `import org.apache.camel.EndpointInject;`
  `import org.apache.camel.component.mock.MockEndpoint;`
- [ ] **Step 2:** Add the mock endpoint field next to the other injects:

  ```java
  @EndpointInject("mock:dlq-capture")
  MockEndpoint mockDlq;
  ```

- [ ] **Step 3:** In `adviceRoutes()`, inside the same
  `AdviceWith.adviceWith(context, "org-bootstrap", route -> { … })` block,
  add after the `replaceFromWith(...)`:

  ```java
  route.interceptSendToEndpoint("kafka:dlq.gdfkube.groups")
          .skipSendToOriginalEndpoint()
          .to("mock:dlq-capture");
  ```

  (Mirrors `DlqFlowTest.adviceRoutes()`.)
- [ ] **Step 4:** In `@BeforeEach resetState()` add `mockDlq.reset();`.
- [ ] **Step 5:** Rewrite `helmRenderFailure_dlq` body:

  ```java
  reset(helmTemplateRunner);
  when(helmTemplateRunner.render(anyString(), anyString(), anyString(), anyString()))
          .thenThrow(new RuntimeException("helm template failed (exit 1): chart not found"));
  mockDlq.expectedMinimumMessageCount(1);

  try {
      sendGroupEvent("cultura", "gdfkube-cultura", "c");
  } catch (Exception ignored) {
      // deadLetterChannel handles the exchange after retries; capture asserts the outcome
  }

  mockDlq.assertIsSatisfied(45000); // 3 redeliveries / 1000ms / x5.0 backoff, matches DlqFlowTest
  verify(helmTemplateRunner, atLeastOnce()).render(anyString(), anyString(), anyString(), anyString());
  ```

- [ ] **Step 6:** Run `mvn -q -Dtest=OrgBootstrapIntegrationTest test` — expect
  `Tests run: 7, Failures: 0, Errors: 0, Skipped: 0`.
- [ ] **Commit:** `test(camel): verify helm-render DLQ via mock:dlq-capture`

## Task 5: Full verification & guardrails

- [ ] **Step 1:** From `gdfkube-src/gdfkube-camel`:
  `mvn -q -Dtest=OrgBootstrapIntegrationTest test` → 7/7. Re-run immediately
  within 60s → 7/7 (FR2 cross-run).
- [ ] **Step 2:** Force reverse method order (e.g.
  `-Djunit.jupiter.testmethod.order.default=org.junit.jupiter.api.MethodOrderer$MethodName`
  with a reversed comparator, or `@TestMethodOrder(MethodOrderer.Random.class)`
  applied temporarily then reverted) → still 7/7. Revert any temporary
  ordering annotation.
- [ ] **Step 3:** `mvn -q test` (full module) → `DlqFlowTest`,
  `ApprovalLoopGuardTest`, `PipelineIntegrationTest` green; no regression.
- [ ] **Step 4:** Inspect
  `build/surefire-reports/TEST-gov.gdf.camel.routes.OrgBootstrapIntegrationTest.xml`
  → `failures="0" errors="0"`; no failing assertion in `system-out` precedes
  the corresponding Camel route log.
- [ ] **Step 5:** Guardrails: `git diff -- gdfkube-src/gdfkube-camel/pom.xml`
  empty; `git grep -n "Thread.sleep\|awaitility\|NotifyBuilder"
  gdfkube-src/gdfkube-camel/src/test` returns nothing new;
  `OrgBootstrapRoute.java` diff limited to `clearDedupCacheForTesting()`.
- [ ] **Step 6:** If the build tool/wrapper is unavailable in-environment,
  return the exact `mvn` commands above to the user to run manually rather
  than skipping verification.
- [ ] **Step 7:** `pre-commit run --all-files` (trufflehog) before final
  commit/push.
- [ ] **Commit:** `test(camel): make OrgBootstrapIntegrationTest deterministic (7/7)`

---

## Acceptance mapping

| Acceptance criterion | Covered by |
|---|---|
| 7 tests, 0 failures/errors | Task 4 Step 6, Task 5 Step 1 |
| 7/7 on immediate re-run within 60s | Task 3 Step 4, Task 5 Step 1 |
| 7/7 under reverse/random method order | Task 5 Step 2 |
| No failing assertion precedes worker log | Task 5 Step 4 |
| `helmRenderFailure_dlq` via mock:dlq-capture | Task 4 |
| Production behavior unchanged (diff bounded) | Task 1 Step 3, Task 5 Step 5 |
| No new pom dependency / no Thread.sleep | Task 5 Step 5 |
