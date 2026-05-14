## 1. Production-side Clock seam

- [ ] 1.1 Add `@Inject Clock clock` to `gdfkube-src/gdfkube-camel/src/main/java/.../OrgBootstrapRoute.java`
- [ ] 1.2 Replace `System.currentTimeMillis()` (currently `OrgBootstrapRoute:109`) with `clock.millis()`
- [ ] 1.3 Update `evictExpired()` (and any other TTL touch points in the route) to read `clock.millis()`
- [ ] 1.4 Add a default `@Produces @ApplicationScoped Clock systemClock()` returning `Clock.systemUTC()` (either inline on `OrgBootstrapRoute` or in a small `ClockProducer` bean — pick whichever matches existing producer placement in the module)
- [ ] 1.5 Run `./mvnw -pl gdfkube-src/gdfkube-camel compile` and confirm no compile regressions

## 2. Test-side MutableClock and producer

- [ ] 2.1 Add `gdfkube-src/gdfkube-camel/src/test/java/.../MutableClock.java` — a `Clock` subclass holding an `Instant` field with `set(Instant)` and `advance(Duration)` methods
- [ ] 2.2 Add a test-only `@Produces @Alternative @Priority(1) Clock testClock()` returning a singleton `MutableClock` fixed at `Instant.parse("2026-01-01T00:00:00Z")`
- [ ] 2.3 Enable the alternative via `@TestProfile` or `application-test.properties` so it activates only for `OrgBootstrapIntegrationTest` (do not leak into other integration tests)
- [ ] 2.4 Verify in a smoke unit test that `OrgBootstrapRoute`'s injected `Clock` resolves to the `MutableClock` under the test profile

## 3. MockGitProvider path parity

- [ ] 3.1 In `gdfkube-src/gdfkube-camel/src/test/java/.../MockGitProvider.java`, change `commitAndPush` from `workTree.resolve(file.getFileName())` to `workTree.resolve(workTree.relativize(file))`
- [ ] 3.2 Update internal recorded-commits storage so paths persist with their `orgs/<groupId>/` prefix
- [ ] 3.3 Update `getCommits(owner, repo)` to return relative paths (with prefix preserved)
- [ ] 3.4 Add `getCommittedPaths(owner, repo)` returning `List<Path>` for terse path-based assertions
- [ ] 3.5 Grep for all callers of `MockGitProvider#getCommits` and update their assertions to match the prefixed format (`grep -rn "getCommits\b" gdfkube-src/gdfkube-camel/src/test`)
- [ ] 3.6 Run `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest='!OrgBootstrap*'` to confirm no unrelated test regressions

## 4. Rewrite helmRenderFailure_dlq

- [ ] 4.1 Read `DlqHeaders.stamp()` to enumerate the current mandatory header set (target: 9 headers)
- [ ] 4.2 In `OrgBootstrapIntegrationTest`, replace the existing `helmRenderFailure_dlq` body with the `AdviceWith`-based `MockEndpoint` pattern from `DlqFlowTest`:
  - `@EndpointInject("mock:dlq.gdfkube.groups") MockEndpoint dlqMock`
  - Use `AdviceWith.adviceWith(...)` on the route context to rewrite the kafka producer URI to `mock:dlq.gdfkube.groups`
  - `dlqMock.expectedMessageCount(1)`
  - `dlqMock.expectedHeaderReceived("dlq.routeId", "org-bootstrap")`
  - `dlqMock.expectedHeaderReceived("dlq.topic", "dlq.gdfkube.groups")`
  - Add one `expectedHeaderReceived` for each remaining mandatory header from 4.1
  - `when(helmTemplateRunner.render(any(), any(), any(), any())).thenThrow(new RuntimeException("helm template failed (exit 1)"))`
  - `sendGroupEvent("cultura", "gdfkube-cultura", "c")`
  - `dlqMock.assertIsSatisfied(5_000)`
- [ ] 4.3 Remove the `try { … } catch (Exception ignored) {}` block and the obsolete `verify(helmTemplateRunner, atLeastOnce()).render(...)` call
- [ ] 4.4 Run `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=OrgBootstrapIntegrationTest#helmRenderFailure_dlq` — must be green

## 5. Split TTL tests

- [ ] 5.1 Inject `MutableClock` (or look it up via CDI) into `OrgBootstrapIntegrationTest`
- [ ] 5.2 Rewrite `replayWithinTtl_dedupedByCache`:
  - Send first event; assert exactly 1 commit on `gdfkube-orgs`
  - Reset `mockGitProvider`; re-create the repo
  - `clock.advance(Duration.ofSeconds(30))`
  - Send the same event; assert 0 commits on `gdfkube-orgs`
- [ ] 5.3 Add a new test `replayAfterTtl_reprocesses`:
  - Send first event
  - Reset `mockGitProvider`; re-create the repo
  - `clock.advance(Duration.ofSeconds(61))`
  - Send the same event; assert exactly 1 new commit on `gdfkube-orgs`
- [ ] 5.4 Run `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=OrgBootstrapIntegrationTest#replay*` — both must be green

## 6. Rename + strengthen first-event test

- [ ] 6.1 Rename Java method `firstEvent_bootstrapsBothReposAndWritesAllFour` → `firstEvent_bootstrapsBothReposAndWritesAllThree` in `OrgBootstrapIntegrationTest`
- [ ] 6.2 Add path-placement assertion using `mockGitProvider.getCommittedPaths(OWNER, "gdfkube-orgs")`:
  ```
  assertThat(committed).contains(
      Path.of("orgs/cultura/appproject.yaml"),
      Path.of("orgs/cultura/applicationset.yaml"),
      Path.of("orgs/cultura/cultura-clusterset.yaml")
  );
  ```
- [ ] 6.3 Update `openspec/changes/auto-provision-org-resources-from-group-events/tasks.md` line 41: rename `5.2 Test firstEvent_bootstrapsBothReposAndWritesAllFour` → `…AllThree`
- [ ] 6.4 Run `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=OrgBootstrapIntegrationTest#firstEvent_bootstrapsBothReposAndWritesAllThree` — must be green

## 7. Cross-change bookkeeping (A-38)

- [ ] 7.1 In `openspec/changes/auto-provision-org-resources-from-group-events/tasks.md:47`, flip task 5.8 from `[x]` to `[ ]` and append the note `(Previously marked complete but the test only asserted render() was called; rewriting per H-6 to assert DLQ topic + 9 mandatory headers — see strengthen-org-bootstrap-tests change.)`
- [ ] 7.2 Add a TODO note (in the parent change's plan/verify file, not a code TODO) to re-tick 5.8 after this change's verify gate passes

## 8. Mutation-style sanity verification (manual, executed during verify phase)

- [ ] 8.1 Temporarily comment out `evictExpired()` in `OrgBootstrapRoute`; run `OrgBootstrapIntegrationTest#replayAfterTtl_reprocesses`; confirm it fails; revert
- [ ] 8.2 Temporarily change `OrgBootstrapRoute` write target from `workTree/orgs/<groupId>` to `workTree`; run `OrgBootstrapIntegrationTest#firstEvent_bootstrapsBothReposAndWritesAllThree`; confirm it fails; revert
- [ ] 8.3 Temporarily change DLQ topic publish from `dlq.gdfkube.groups` to `dlq.gdfkube.orgs`; run `OrgBootstrapIntegrationTest#helmRenderFailure_dlq`; confirm it fails; revert

## 9. Full-suite green + pre-commit

- [ ] 9.1 Run `./mvnw -pl gdfkube-src/gdfkube-camel test` — entire module green
- [ ] 9.2 Run `pre-commit run --all-files` — trufflehog clean, no other hook failures
