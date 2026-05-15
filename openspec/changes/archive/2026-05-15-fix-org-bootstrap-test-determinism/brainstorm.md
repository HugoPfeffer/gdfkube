## Design Summary

Make `OrgBootstrapIntegrationTest` deterministic (7/7 on every run, any JUnit
method order, repeated runs within the 60s dedup TTL) by eliminating two
test-harness defects without changing `OrgBootstrapRoute` production behavior:

1. **Async race** — the `@BeforeAll` advice rewires the route input to
   `seda:org-bootstrap-test` and `sendGroupEvent` posts to that SEDA endpoint.
   SEDA dispatches to a background worker and `producer.send` returns
   immediately, so assertions on `main` run before the route creates repos,
   commits, or calls Helm. Fix: switch to `direct:org-bootstrap-test` so the
   route runs synchronously on the caller thread and `producer.send` blocks
   until the whole route (including DLQ routing) completes — the exact pattern
   `ApprovalLoopGuardTest` already uses.

2. **Shared dedup cache across tests** — `OrgBootstrapRoute` is
   `@ApplicationScoped` with a process-lifetime `dedupCache` (60s TTL). With
   `@TestInstance(PER_CLASS)`, once any test fully processes groupId
   `"cultura"`, later tests reusing that id short-circuit at the dedup guard and
   produce no repos/commits/Helm calls. Fix: add a single, explicitly
   test-named reset hook (`clearDedupCacheForTesting()`) on the route, inject
   the bean, and call it from `@BeforeEach` alongside the existing
   `mockGitProvider.reset()` / `reset(helmTemplateRunner)`.

The DLQ test (`helmRenderFailure_dlq`) additionally moves from a timing-fragile
Mockito `verify` to a deterministic `mock:dlq-capture` endpoint assertion
mirroring `DlqFlowTest`.

## Alternatives Considered

### Option A: Synchronous `direct:` dispatch + test-only dedup-reset hook (chosen)
- **Approach**: `replaceFromWith("direct:org-bootstrap-test")`,
  `producer.send("direct:…")`, add `clearDedupCacheForTesting()` to the route
  called from `@BeforeEach`, and capture DLQ via
  `interceptSendToEndpoint(...).skipSendToOriginalEndpoint().to("mock:dlq-capture")`.
- **Pros**: No sleeps, no polling, no new dependencies. Mirrors the synchronous
  pattern already proven by `ApprovalLoopGuardTest` and `DlqFlowTest` in the
  same module. Production diff is a single, self-documenting test-only method —
  route topology, TTL, DLQ topic, redelivery, Git/Helm orchestration untouched.
  Deterministic regardless of method order and of the 60s TTL.
- **Cons**: One deliberate production-side touch (the reset method) — package
  scoped/test-named to keep intent unambiguous.
- **Why not chosen**: This *is* the chosen approach.

### Option B: Injectable-clock / `MutableClock` TTL refactor
- **Approach**: Replace `System.currentTimeMillis()` in dedup eviction with an
  injected `java.time.Clock`; integration tests advance a `MutableClock` to
  cross the 60s boundary deterministically (the approach taken by the existing
  `strengthen-org-bootstrap-tests` change).
- **Pros**: Lets a test assert *both* sides of the TTL boundary without sleeps.
- **Cons**: Larger production refactor of the dedup path; introduces a new
  time-abstraction seam not needed for the determinism this change targets.
  Does not by itself fix the async race (the primary cause of 6/7 failures).
- **Why not chosen**: Explicit Non-Goal here. Determinism for these 7 tests
  needs only synchronous dispatch + per-test cache isolation; both replay sends
  occur well within the 60s window in the same test, so no clock seam is
  required. Keeps the production change minimal.

### Option C: Keep SEDA, add Awaitility / `NotifyBuilder` / sleeps to await completion
- **Approach**: Leave async SEDA dispatch; gate assertions behind
  `NotifyBuilder.whenDone(1).create().matches(timeout)` or Awaitility polling.
- **Pros**: No production-side change at all.
- **Cons**: Introduces timing/polling and (for Awaitility) a new test
  dependency on `gdfkube-camel/pom.xml`; inherently more fragile than
  synchronous dispatch; diverges from the established module pattern. Still
  doesn't fix the cross-test dedup leak.
- **Why not chosen**: Violates the "no new test dependencies, no sleeps, no
  polling" constraint and is strictly worse than synchronous dispatch which the
  module already standardizes on.

## Agreed Approach

**Option A.** It removes the root causes (async race + cross-test dedup leak)
with the smallest, most maintainable footprint, reuses patterns already proven
in `ApprovalLoopGuardTest`/`DlqFlowTest`, and keeps `OrgBootstrapRoute`
production behavior functionally unchanged (single test-only reset method as
the sole deliberate production touch). It satisfies all acceptance criteria
without a clock refactor or new dependencies.

## Key Decisions

- `direct:` (synchronous, caller-thread) replaces `seda:` for the test route
  input and producer send — `producer.send` then blocks through the full route
  including dead-letter routing.
- The dedup reset is a route method, not a test-profile flag: global dedup
  disable would break `replayWithinTtl_dedupedByCache`, which still needs dedup
  active *within* a single test.
- DLQ outcome is asserted via a captured `mock:dlq-capture` endpoint
  (`assertIsSatisfied(timeout)`), not a racing Mockito `verify`. An optional
  post-completion `verify(helmTemplateRunner)` may remain — now safe because
  dispatch is synchronous — but the DLQ-capture assertion is the source of
  truth. Timeout sized to the route's redelivery policy (max 3 redeliveries,
  1000ms initial, ×5.0 backoff), consistent with `DlqFlowTest`.
- No injectable clock, no global dedup disable, no `Thread.sleep`, no
  Awaitility, no `NotifyBuilder`, no new `pom.xml` dependency.

## Open Questions

- None blocking. Note for reviewers: an existing change
  `strengthen-org-bootstrap-tests` targets the same test file via the
  injectable-clock approach (Option B) and is 6/8 complete. These two changes
  are alternative strategies for overlapping problems; coordinating which one
  lands (and superseding/archiving the other) is a project-level decision
  outside this artifact's scope.
