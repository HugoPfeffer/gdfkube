## Design Summary

Three tests in `OrgBootstrapIntegrationTest.java` are named like they enforce a contract but don't — `helmRenderFailure_dlq`, `replayWithinTtl_dedupedByCache`, and `firstEvent_bootstrapsBothReposAndWritesAllFour` all pass green while leaving the real invariants unverified (DLQ topic/headers, TTL eviction, on-disk path placement). `MockGitProvider.commitAndPush` also flattens paths, so any regression in `OrgBootstrapRoute` writing to `workTree/orgs/<groupId>/` would not be caught.

The agreed approach: introduce a `Clock` seam to drive TTL deterministically, fix `MockGitProvider` to preserve relative paths (parity with `GiteaGitProvider`), rewrite the DLQ test to assert against a `MockEndpoint` with the mandatory `DlqHeaders.stamp()` headers, and split the TTL test into `replayWithinTtl_dedupedByCache` and `replayAfterTtl_reprocesses`. No new behavior is added to `OrgBootstrapRoute` beyond the `Clock` injection.

## Alternatives Considered

### Option A: Inject `Clock` + `MockEndpoint` + path-preserving `MockGitProvider` (chosen)
- **Approach**: Minimal, surgical changes. `Clock` becomes a CDI bean (`Clock.systemUTC()` by default, `MutableClock` in tests). `helmRenderFailure_dlq` advises the kafka producer to a `mock:dlq.gdfkube.groups` endpoint and asserts the 9 mandatory `DlqHeaders` fields. `MockGitProvider.commitAndPush` switches to `workTree.relativize(file)` to mirror `GiteaGitProvider`.
- **Pros**: Mirrors patterns already in use (`DlqFlowTest`, CDI `@Produces`); blast radius is ~80 LOC of test delta + one route line; deterministic TTL without sleeping.
- **Cons**: Adds a test-only `MutableClock` bean; one production line in `OrgBootstrapRoute` (`clock.millis()`) changes.
- **Why chosen**: Smallest seam that makes the three tests legitimate; aligns with project preference for changing existing services over adding new ones.

### Option B: Replace `MockGitProvider` with a real Gitea Testcontainer
- **Approach**: Use Testcontainers to spin up a real Gitea instance per integration test class so commit path semantics, branching, and conflict behavior are exercised end-to-end.
- **Pros**: Eliminates the entire class of mock-vs-real drift bugs that motivated this change.
- **Cons**: Heavier CI cost (~tens of seconds per class), much larger diff, and TTL/DLQ failure modes can already be asserted without it.
- **Why not chosen**: Out of scope per the source plan — fixing the existing mock is sufficient to close H-3 and is cheaper.

### Option C: `Thread.sleep(61_000)` + extend TTL boundary test in place
- **Approach**: Keep the existing `replayWithinTtl_dedupedByCache` shape and add a second test that sleeps past 60s to assert re-processing.
- **Pros**: No production change needed (no `Clock` injection).
- **Cons**: Flaky on slow CI, ≥61s per run, leaks real time into the test suite, makes future TTL tuning expensive.
- **Why not chosen**: Conflicts with the simplicity/maintainability value — a `Clock` seam is one line and pays dividends in any future TTL test.

## Agreed Approach

Option A. The `Clock` seam is the only production-side change and it unlocks deterministic TTL assertions without slowing the suite. The `MockGitProvider` path fix is a pure mock parity bug and lands alongside. The DLQ rewrite reuses the `MockEndpoint` + `AdviceWith` pattern already established in `DlqFlowTest`, so no new test infrastructure is introduced.

## Key Decisions

- **DLQ topic name stays `dlq.gdfkube.groups`** — no rename; aligns with `declare-missing-kafka-topics-and-mongo-signals.md`.
- **`Clock` is CDI-injected**, not a static field. Default producer returns `Clock.systemUTC()`; integration test profile exposes a `MutableClock` that advances on demand.
- **`MockGitProvider.getCommits` returns relative paths with the `orgs/<groupId>/` prefix preserved** — callers of `getCommits` must update their assertions to match.
- **The test method `firstEvent_bootstrapsBothReposAndWritesAllFour` is renamed to `firstEvent_bootstrapsBothReposAndWritesAllThree`** (A-37) and the matching reference in `openspec/changes/auto-provision-org-resources-from-group-events/tasks.md:41` updates with it.
- **Task 5.8 in `auto-provision-org-resources-from-group-events/tasks.md:47` is un-ticked** (A-38) until the rewritten DLQ test lands.
- **Companion test `replayAfterTtl_reprocesses` is added** so the 60s boundary is asserted from both sides; a permanent `ConcurrentHashMap.put` with no eviction must fail this test.
- **Path assertion added to `firstEvent_…_AllThree`**: assert committed paths include `orgs/cultura/{appproject,applicationset,cultura-clusterset}.yaml`, not just the filenames.

## Open Questions

- None blocking. The plan's "Blocked by" entry on `harden-org-bootstrap-route.md` (dedup-after-success) is acknowledged: if that change lands first and moves the cache-write to after a successful commit, the TTL tests' fixture setup may need to assert success before advancing the clock. Resolve at implementation time by reading the route as it exists when this change is applied.
