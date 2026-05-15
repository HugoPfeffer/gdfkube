# Strengthen OrgBootstrap Tests Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Each task ends with an explicit verification step and a commit point.

**Goal:** Replace three green-but-vacuous integration tests on `OrgBootstrapRoute` with assertions that actually enforce the DLQ-header contract, the 60s TTL boundary (from both sides), and the on-disk path placement under `orgs/<groupId>/`.

**Architecture:** Introduce a `java.time.Clock` CDI seam on `OrgBootstrapRoute` (default `Clock.systemUTC()`, integration tests get a `MutableClock` alternative). Fix `MockGitProvider.commitAndPush` to preserve the relative path tree (parity with `GiteaGitProvider`). Rewrite the DLQ test to assert against a Camel `MockEndpoint` produced by `AdviceWith` redirecting the kafka producer URI; split the TTL test into within-/after-boundary halves driven by the `MutableClock`; rename the first-event test (A-37) and bolt on path-placement assertions.

**Tech Stack:** Quarkus 3.16.3, Apache Camel 4.6.0, JUnit 5, Mockito, Camel `MockEndpoint` + `AdviceWith`, plain `java.time.Clock` (no new libraries).

**Anchors:**
- Source plan: `.claude/plans/strengthen-org-bootstrap-tests.md`
- Spec deltas: `openspec/changes/strengthen-org-bootstrap-tests/specs/camel-orchestrator-stack/spec.md`
- Design rationale: `openspec/changes/strengthen-org-bootstrap-tests/design.md`
- DLQ pattern reference (existing): `gdfkube-src/gdfkube-camel/src/test/java/.../DlqFlowTest.java`
- `DlqHeaders.stamp()`: read at the start of Task 4 to enumerate the current mandatory header set

---

## Task 1: Production `Clock` seam on `OrgBootstrapRoute`

- [ ] **Step 1.1:** `grep -n "System.currentTimeMillis\|TTL\|dedupCache" gdfkube-src/gdfkube-camel/src/main/java/**/OrgBootstrapRoute.java` to confirm the call sites match the source plan's reference to line 109.
- [ ] **Step 1.2:** Add `import java.time.Clock;` and an `@Inject Clock clock;` field on `OrgBootstrapRoute`.
- [ ] **Step 1.3:** Replace every `System.currentTimeMillis()` inside the route (TTL put + `evictExpired`) with `clock.millis()`.
- [ ] **Step 1.4:** Add a default producer. If a `ClockProducer`-style bean already exists in the module, register `Clock.systemUTC()` there; otherwise add to `OrgBootstrapRoute`:
  ```java
  @Produces @ApplicationScoped
  Clock systemClock() { return Clock.systemUTC(); }
  ```
- [ ] **Step 1.5:** `./mvnw -pl gdfkube-src/gdfkube-camel compile` — must succeed with no warnings on the new injection.
- [ ] **Step 1.6:** Commit: `wire Clock seam into OrgBootstrapRoute for deterministic TTL`.

## Task 2: Test-only `MutableClock` + alternative producer

- [ ] **Step 2.1:** Create `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/testsupport/MutableClock.java`:
  ```java
  public class MutableClock extends Clock {
      private Instant now;
      private final ZoneId zone = ZoneOffset.UTC;
      public MutableClock(Instant start) { this.now = start; }
      @Override public ZoneId getZone() { return zone; }
      @Override public Clock withZone(ZoneId z) { throw new UnsupportedOperationException(); }
      @Override public Instant instant() { return now; }
      public synchronized void set(Instant i) { this.now = i; }
      public synchronized void advance(Duration d) { this.now = this.now.plus(d); }
  }
  ```
- [ ] **Step 2.2:** Add a test producer next to the test class (e.g. `OrgBootstrapTestClockProducer.java`) with `@Alternative @Priority(1)` returning a singleton `MutableClock` fixed at `Instant.parse("2026-01-01T00:00:00Z")`.
- [ ] **Step 2.3:** Activate via `@TestProfile` (preferred) or `src/test/resources/application-test.properties` scoped to `OrgBootstrapIntegrationTest` only. Verify other ITs in the module don't accidentally pick up the alternative.
- [ ] **Step 2.4:** Add a tiny smoke `@Test` in `OrgBootstrapIntegrationTest` that asserts `clock instanceof MutableClock` (CDI lookup via `Arc.container().instance(Clock.class)`).
- [ ] **Step 2.5:** `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=OrgBootstrapIntegrationTest#clockSeam_isMutableUnderTestProfile` — must be green.
- [ ] **Step 2.6:** Commit: `add MutableClock test alternative for OrgBootstrap TTL`.

## Task 3: `MockGitProvider` path parity with `GiteaGitProvider`

- [ ] **Step 3.1:** `grep -rn "getCommits\b" gdfkube-src/gdfkube-camel/src/test` — record every caller. These all need assertion updates in 3.6.
- [ ] **Step 3.2:** In `MockGitProvider.commitAndPush`, change:
  ```java
  for (Path file : files) {
      Path target = workTree.resolve(file.getFileName());
      ...
  }
  ```
  to:
  ```java
  for (Path file : files) {
      Path relative = workTree.relativize(file);
      Path target = workTree.resolve(relative);
      Files.createDirectories(target.getParent());
      ...
  }
  ```
- [ ] **Step 3.3:** Update the internal recorded-commits structure so each `CommitRecord` stores `List<Path>` of paths relative to `workTree`.
- [ ] **Step 3.4:** Update `getCommits(owner, repo)` to return the prefixed paths; do NOT keep a flattened view.
- [ ] **Step 3.5:** Add `public List<Path> getCommittedPaths(String owner, String repo)` returning a flat list of relative paths across all commits for a repo (used by `firstEvent_…_AllThree`).
- [ ] **Step 3.6:** For each caller found in 3.1, update assertions from filename-only to relative-path form. Suggested transform: `contains("appproject.yaml")` → `contains(Path.of("orgs/<groupId>/appproject.yaml"))` (or whichever prefix applies in that test).
- [ ] **Step 3.7:** `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest='*' -DfailIfNoTests=false -Dtest='!OrgBootstrap*'` — every non-`OrgBootstrap*` test in the module must still pass.
- [ ] **Step 3.8:** Commit: `make MockGitProvider preserve relative paths to match GiteaGitProvider`.

## Task 4: Rewrite `helmRenderFailure_dlq`

- [ ] **Step 4.1:** Read `DlqHeaders.stamp()` (search: `grep -n "class DlqHeaders" gdfkube-src/gdfkube-camel/src/main/java`). Enumerate every header it stamps. Note: the source plan and the project's DLQ requirement both reference "9 mandatory headers".
- [ ] **Step 4.2:** Read `DlqFlowTest` for the canonical `AdviceWith` + `MockEndpoint` pattern in this codebase. Mirror it.
- [ ] **Step 4.3:** In `OrgBootstrapIntegrationTest`, replace the entire `helmRenderFailure_dlq` method body. Outline:
  ```java
  @EndpointInject("mock:dlq.gdfkube.groups")
  MockEndpoint dlqMock;

  @Test
  void helmRenderFailure_dlq() throws Exception {
      AdviceWith.adviceWith(context, "org-bootstrap", r ->
          r.weaveByToUri("kafka:dlq.gdfkube.groups*").replace().to("mock:dlq.gdfkube.groups"));

      dlqMock.expectedMessageCount(1);
      dlqMock.expectedHeaderReceived("dlq.routeId", "org-bootstrap");
      dlqMock.expectedHeaderReceived("dlq.topic", "dlq.gdfkube.groups");
      dlqMock.expectedHeaderReceived("dlq.errorClass", "java.lang.RuntimeException");
      // ... one expectedHeaderReceived for each remaining stamped header from 4.1

      reset(helmTemplateRunner);
      when(helmTemplateRunner.render(any(), any(), any(), any()))
          .thenThrow(new RuntimeException("helm template failed (exit 1)"));

      sendGroupEvent("cultura", "gdfkube-cultura", "c");

      dlqMock.assertIsSatisfied(5_000);
  }
  ```
- [ ] **Step 4.4:** Delete the original `try { … } catch (Exception ignored) {}` block and the `verify(helmTemplateRunner, atLeastOnce()).render(...)` line.
- [ ] **Step 4.5:** Ensure `@EnableAdvice` (or equivalent) is on the test class so `AdviceWith` can mutate the route at test time. Mirror `DlqFlowTest` exactly.
- [ ] **Step 4.6:** `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=OrgBootstrapIntegrationTest#helmRenderFailure_dlq` — must be green.
- [ ] **Step 4.7:** Commit: `rewrite helmRenderFailure_dlq to assert DLQ topic and 9 mandatory headers`.

## Task 5: Split TTL tests

- [ ] **Step 5.1:** In `OrgBootstrapIntegrationTest`, look up the `MutableClock` (e.g. `@Inject Clock clock;` then cast, or `Arc.container().instance(MutableClock.class).get()`).
- [ ] **Step 5.2:** Rewrite `replayWithinTtl_dedupedByCache`:
  ```java
  @Test
  void replayWithinTtl_dedupedByCache() throws Exception {
      sendGroupEvent("cultura", "gdfkube-cultura", "c");
      assertEquals(1, mockGitProvider.getCommits(OWNER, "gdfkube-orgs").size());

      mockGitProvider.reset();
      mockGitProvider.createRepo(OWNER, "gdfkube-orgs", new RepoOptions(...));

      mutableClock.advance(Duration.ofSeconds(30));
      sendGroupEvent("cultura", "gdfkube-cultura", "c");

      assertTrue(mockGitProvider.getCommits(OWNER, "gdfkube-orgs").isEmpty(),
          "Event within 60s should be deduped");
  }
  ```
- [ ] **Step 5.3:** Add a sibling test `replayAfterTtl_reprocesses`:
  ```java
  @Test
  void replayAfterTtl_reprocesses() throws Exception {
      sendGroupEvent("cultura", "gdfkube-cultura", "c");
      mockGitProvider.reset();
      mockGitProvider.createRepo(OWNER, "gdfkube-orgs", new RepoOptions(...));

      mutableClock.advance(Duration.ofSeconds(61));
      sendGroupEvent("cultura", "gdfkube-cultura", "c");

      assertEquals(1, mockGitProvider.getCommits(OWNER, "gdfkube-orgs").size(),
          "Event after 60s TTL should be re-processed");
  }
  ```
- [ ] **Step 5.4:** `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=OrgBootstrapIntegrationTest#replayWithinTtl_dedupedByCache+replayAfterTtl_reprocesses` — both green.
- [ ] **Step 5.5:** Commit: `split TTL test into within-/after-boundary halves driven by MutableClock`.

## Task 6: Rename + strengthen first-event test (A-37)

- [ ] **Step 6.1:** Rename Java method `firstEvent_bootstrapsBothReposAndWritesAllFour` → `firstEvent_bootstrapsBothReposAndWritesAllThree`.
- [ ] **Step 6.2:** Inside the method, add:
  ```java
  List<Path> committed = mockGitProvider.getCommittedPaths(OWNER, "gdfkube-orgs");
  assertThat(committed).contains(
      Path.of("orgs/cultura/appproject.yaml"),
      Path.of("orgs/cultura/applicationset.yaml"),
      Path.of("orgs/cultura/cultura-clusterset.yaml")
  );
  ```
  (Keep the filename-only assertion if it was already there; the path-based one is additive.)
- [ ] **Step 6.3:** Edit `openspec/changes/auto-provision-org-resources-from-group-events/tasks.md` line 41: rename `5.2 Test firstEvent_bootstrapsBothReposAndWritesAllFour` → `5.2 Test firstEvent_bootstrapsBothReposAndWritesAllThree`.
- [ ] **Step 6.4:** `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=OrgBootstrapIntegrationTest#firstEvent_bootstrapsBothReposAndWritesAllThree` — green.
- [ ] **Step 6.5:** Commit: `rename first-event test to AllThree and assert path placement`.

## Task 7: Cross-change bookkeeping (A-38)

- [ ] **Step 7.1:** Edit `openspec/changes/auto-provision-org-resources-from-group-events/tasks.md:47`. Flip from:
  ```
  - [x] 5.8 Test helmRenderFailure_dlq: ...
  ```
  to:
  ```
  - [ ] 5.8 Test helmRenderFailure_dlq: ... (Previously marked complete but the
         test only asserted render() was called; rewriting per H-6 to assert
         DLQ topic + 9 mandatory headers — see strengthen-org-bootstrap-tests change.)
  ```
- [ ] **Step 7.2:** Record in this change's `verify.md` (created in the verify phase) that 5.8 must be re-ticked after Tasks 8 + 9 are green.
- [ ] **Step 7.3:** Commit: `un-tick auto-provision task 5.8 pending DLQ test rewrite`.

## Task 8: Mutation-style sanity verification (manual)

> Run these three checks once Tasks 1-7 are committed and the full suite is green. They live in this plan, not in CI, because they're temporary local mutations that must be reverted.

- [ ] **Step 8.1:** Comment out `evictExpired()` (or its only call site) in `OrgBootstrapRoute`. Run `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=OrgBootstrapIntegrationTest#replayAfterTtl_reprocesses`. Confirm it FAILS. `git checkout -- OrgBootstrapRoute.java` to revert.
- [ ] **Step 8.2:** Change the route's write target from `workTree.resolve("orgs").resolve(groupId)` to just `workTree`. Run `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=OrgBootstrapIntegrationTest#firstEvent_bootstrapsBothReposAndWritesAllThree`. Confirm it FAILS. Revert.
- [ ] **Step 8.3:** Change the DLQ topic publish URI from `kafka:dlq.gdfkube.groups` to `kafka:dlq.gdfkube.orgs`. Run `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=OrgBootstrapIntegrationTest#helmRenderFailure_dlq`. Confirm it FAILS (the `dlq.topic` header assertion is the canary). Revert.
- [ ] **Step 8.4:** Record the three mutation-test outcomes in `verify.md`.

## Task 9: Full-suite green + pre-commit + retro-prep

- [ ] **Step 9.1:** `./mvnw -pl gdfkube-src/gdfkube-camel test` — entire module green.
- [ ] **Step 9.2:** `pre-commit run --all-files` — trufflehog clean, every hook passing.
- [ ] **Step 9.3:** Re-tick task 5.8 in `auto-provision-org-resources-from-group-events/tasks.md` (Step 7.1 inverse) noting the resolving change.
- [ ] **Step 9.4:** Final commit: `re-tick auto-provision 5.8 after DLQ test rewrite verified`.

---

## Verification matrix (summary)

| Spec scenario | Verifying test | Mutation that must fail it |
|---|---|---|
| Replay within TTL is suppressed | `replayWithinTtl_dedupedByCache` | (Task 8.1) Disable `evictExpired` — still green here; covered by 8.1's after-TTL case |
| Replay after TTL re-processes | `replayAfterTtl_reprocesses` | Task 8.1 — disabling `evictExpired` fails this |
| First event writes 3 files at `orgs/<groupId>/` | `firstEvent_bootstrapsBothReposAndWritesAllThree` | Task 8.2 — flatten route write target fails this |
| DLQ test asserts topic + 9 headers | `helmRenderFailure_dlq` (rewritten) | Task 8.3 — wrong DLQ topic fails this |
| MockGitProvider preserves path prefix | All callers of `getCommits` post-Task 3 | Flattening regression in `MockGitProvider.commitAndPush` |

## Dependency notes

- **Blocked by:** `harden-org-bootstrap-route.md` (dedup-after-success) and `declare-missing-kafka-topics-and-mongo-signals.md` (DLQ topic `dlq.gdfkube.groups` must be declared). Check both changes' status before starting Task 4; if either is mid-flight, coordinate to land theirs first.
- **Unblocks:** Re-ticking task 5.8 in `auto-provision-org-resources-from-group-events/tasks.md` (handled in Step 9.3).
