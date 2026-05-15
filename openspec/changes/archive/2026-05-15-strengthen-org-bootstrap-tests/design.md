## Context

`OrgBootstrapRoute` (`gdfkube-src/gdfkube-camel/src/main/java/.../OrgBootstrapRoute.java`) handles group lifecycle events from Kafka, runs `helm template` to render ArgoCD manifests, and commits them to two Gitea repos (`gdfkube-orgs`, `gdfkube-infra`) under `orgs/<groupId>/`. It deduplicates by holding a 60s `ConcurrentHashMap` keyed by event ID, evicting expired entries on each call. Failures land on `dlq.gdfkube.groups` with headers stamped by `DlqHeaders.stamp()`.

`OrgBootstrapIntegrationTest` is the only integration test class for the route. It uses an in-memory `MockGitProvider` test double in place of `GiteaGitProvider`. The audit (`tmp/unified-audit-findings.md` H-3, H-6, H-12; amendments A-37, A-38) found three named-but-not-actually-enforcing tests and one mock parity bug. The plan source is `.claude/plans/strengthen-org-bootstrap-tests.md`.

Constraints:
- DLQ topic name `dlq.gdfkube.groups` is fixed by `declare-missing-kafka-topics-and-mongo-signals.md`; this change must NOT rename it.
- `harden-org-bootstrap-route.md` may move the dedup-cache write to after a successful commit. This change's tests must remain valid whichever lands first (key the dedup assertion off a successful first event, not just an attempt).
- Stack values from `openspec/config.yaml`: Quarkus + Camel + JUnit + Mockito.

## Goals / Non-Goals

**Goals:**
- Make `helmRenderFailure_dlq` fail when the DLQ topic name, route ID, or the mandatory `DlqHeaders` set regresses.
- Make `replayWithinTtl_dedupedByCache` + `replayAfterTtl_reprocesses` together fail under any TTL regression: missing eviction, wrong duration, or unbounded cache.
- Make `firstEvent_bootstrapsBothReposAndWritesAllThree` fail if `OrgBootstrapRoute` writes to anywhere other than `workTree/orgs/<groupId>/`.
- Bring `MockGitProvider.commitAndPush` into behavioral parity with `GiteaGitProvider.commitAndPush` (preserves relative path).
- Unblock A-37 (rename) and A-38 (un-tick 5.8 in the parent change).

**Non-Goals:**
- Adding any new behavior to `OrgBootstrapRoute` beyond the `Clock` seam (covered by `harden-org-bootstrap-route.md`).
- Generalising DLQ assertions across all routes (a separate test-quality plan).
- Replacing `MockGitProvider` with a real Gitea Testcontainer (rejected as Option B in `brainstorm.md`).
- Renaming the `dlq.gdfkube.groups` topic.

## Decisions

### D1. Inject `java.time.Clock` instead of using `System.currentTimeMillis()` directly
- **Choice**: Add `@Inject Clock clock` to `OrgBootstrapRoute`; replace `System.currentTimeMillis()` at line 109 with `clock.millis()`. Provide a default `@Produces @ApplicationScoped Clock systemClock() { return Clock.systemUTC(); }` (in a `ClockProducer` class or directly on the route). Integration tests register a `MutableClock` `@Alternative` that exposes `advance(Duration)`.
- **Alternatives**:
  - `Thread.sleep(61_000)` — flaky on slow CI and adds >60s to every CI run. Rejected.
  - Static `Supplier<Long> nowProvider` field on the route — works but introduces a non-idiomatic seam in a CDI-managed bean.
  - `LongAdder`-style test counter — too ad-hoc.
- **Trade-off**: One production line and one new bean for a test seam. Acceptable because `Clock` is JDK-standard and the seam is the smallest possible.

### D2. Mock the DLQ endpoint with `AdviceWith`, assert against `MockEndpoint`
- **Choice**: In `helmRenderFailure_dlq`, use Camel's `AdviceWith` to redirect the kafka producer's URI from `kafka:dlq.gdfkube.groups` to `mock:dlq.gdfkube.groups`, then `@EndpointInject` the `MockEndpoint` and assert message count + all 9 mandatory `DlqHeaders.stamp()` headers (`dlq.routeId`, `dlq.topic`, `dlq.errorClass`, `dlq.errorMessage`, `dlq.timestamp`, `dlq.originalTopic`, `dlq.originalPartition`, `dlq.originalOffset`, `dlq.attemptCount` — exact set determined by reading `DlqHeaders.stamp()` at implementation time).
- **Alternatives**:
  - Spin up an embedded Kafka and read from `dlq.gdfkube.groups` directly — closer to prod but adds Testcontainers/EmbeddedKafka dependency and slower tests. The plan source explicitly prescribes the `MockEndpoint` pattern from `DlqFlowTest`, so we follow it for consistency.
  - Inspect `helmTemplateRunner` exceptions in the test — does not verify the DLQ path at all.
- **Trade-off**: Asserts the producer's intent but not Kafka end-to-end delivery. Acceptable because Kafka delivery semantics are already covered by Camel's tested kafka component.

### D3. Fix `MockGitProvider.commitAndPush` to preserve relative paths
- **Choice**: Replace `workTree.resolve(file.getFileName())` with `workTree.resolve(workTree.relativize(file))` to mirror `GiteaGitProvider`. `getCommits` returns paths relative to `workTree` (i.e. with `orgs/<groupId>/` prefix). Add a `getCommittedPaths(owner, repo)` helper that returns a `List<Path>` of committed relative paths for terse assertions.
- **Alternatives**:
  - Add a separate `getCommittedRelativePaths` while leaving `getCommits` flattened — preserves backward compatibility but bakes in a confusing dual API.
  - Leave the mock as-is and assert via filesystem inspection — couples tests to internal mock state.
- **Trade-off**: Existing tests that call `getCommits` will need their assertions adjusted from `appproject.yaml` to `orgs/<groupId>/appproject.yaml` (or use a "name contains" matcher). Acceptable — there are few callers.

### D4. Split TTL test into within-TTL and after-TTL halves
- **Choice**: Keep `replayWithinTtl_dedupedByCache` (advance clock 30s, expect dedup) and add `replayAfterTtl_reprocesses` (advance clock 61s, expect re-process). Both rely on the `MutableClock` from D1.
- **Alternatives**:
  - Parameterized single test with `(durationSec, expectCommit)` cases — slightly less explicit but more compact. Two-test form was prescribed in the plan and reads better in failure output.
- **Trade-off**: Two methods instead of one; net more lines but clearer signal when one mutation case fails.

### D5. Rename `firstEvent_bootstrapsBothReposAndWritesAllFour` → `…AllThree` (A-37)
- **Choice**: Rename the Java method; update `openspec/changes/auto-provision-org-resources-from-group-events/tasks.md:41` reference. Three is the current emission count (`appproject.yaml`, `applicationset.yaml`, `<groupId>-clusterset.yaml`).
- **Alternatives**: Keep the name and add a comment — leaves drift in place. Rejected.
- **Trade-off**: A 1-line cross-change edit; bookkeeping cost.

### D6. Un-tick task 5.8 in the parent change (A-38)
- **Choice**: Edit `openspec/changes/auto-provision-org-resources-from-group-events/tasks.md:47` from `[x]` to `[ ]` with the note `(Previously marked complete but the test only asserted render() was called; rewriting per H-6 to assert DLQ topic + 9 mandatory headers.)`. Re-tick when this change's verify gate passes.
- **Alternatives**: Leave ticked and add a separate "verify" task — leaves the misleading state. Rejected.
- **Trade-off**: None; it is bookkeeping fidelity.

## Risks / Trade-offs

- **[Risk]** `harden-org-bootstrap-route.md` may move the cache-put to after a successful commit, changing what "first send" means for the TTL fixture. → **Mitigation**: TTL test setup asserts the first event produced a commit before advancing the clock and sending the second event; this works under either cache placement.
- **[Risk]** `AdviceWith` rewires routes at startup; misconfiguration could silently fall back to a real kafka URI in CI. → **Mitigation**: Assert `dlqMock.getReceivedCounter() > 0` before satisfying — a green test must observe at least one message at the mock endpoint, not zero.
- **[Risk]** Other consumers of `MockGitProvider.getCommits` (e.g. tests in unrelated route packages) break when paths gain the `orgs/<groupId>/` prefix. → **Mitigation**: Grep all `getCommits` callers in implementation step 4 and update their assertions in the same commit.
- **[Risk]** The 9 mandatory `DlqHeaders` set may change as `gdfkube-dlq-log-collection` evolves. → **Mitigation**: At implementation time, read `DlqHeaders.stamp()` and assert against the actual current header set; treat the "9" count as a target, not a hardcoded number.
- **[Risk]** `Clock` injection inside a Camel `RouteBuilder` requires the bean to be `@ApplicationScoped` and resolved at processor-build time, not route-definition time. → **Mitigation**: Inject into a processor bean (or use `@Inject` on the route class, where the route's `configure()` runs after CDI startup in Quarkus). This is the same pattern used elsewhere in the codebase for `helmTemplateRunner`.

## Migration Plan

No production data, schema, topic, or Helm value changes. Deployment is:

1. Land the route + mock + test changes together in one PR.
2. Run `./mvnw -pl gdfkube-src/gdfkube-camel test`; CI must be green including the new `replayAfterTtl_reprocesses`.
3. Manual mutation sanity (verify phase): comment out `evictExpired()`, re-run — `replayAfterTtl_reprocesses` must fail. Revert.
4. Manual mutation sanity (verify phase): change `OrgBootstrapRoute` write target from `workTree/orgs/<groupId>` to `workTree`, re-run — `firstEvent_…_AllThree` must fail. Revert.
5. Flip task 5.8 in `auto-provision-org-resources-from-group-events/tasks.md` back to `[x]` only after step 2 is green.
6. Rollback: standard `git revert` of the merge commit. No external state to undo.
