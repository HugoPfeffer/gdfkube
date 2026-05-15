## Retrospective

Change: `fix-org-bootstrap-test-determinism`
Date: 2026-05-15

### What Went Well

- **`direct:` dispatch eliminated all timing races** — Switching from `seda:` to `direct:` immediately fixed 5/7 tests (once filesystem state was also addressed). The pattern is proven in `ApprovalLoopGuardTest` and makes test reasoning trivially straightforward: send blocks until complete, then assert.

- **Per-test dedup reset is clean and minimal** — A single package-private `clearDedupCacheForTesting()` method on the `@ApplicationScoped` route bean mirrors the idiom of `mockGitProvider.reset()`. One line in `@BeforeEach` provides complete isolation without disabling dedup within tests.

- **Full module stayed green** — All 51 tests across 7 test classes passed throughout development. The fix was surgical and caused no regressions.

- **Random/repeat verification caught nothing** — Tests pass under `MethodOrderer$Random` and on immediate repeat within the 60s TTL, proving the isolation is sound.

### What Didn't Go Well

- **`interceptSendToEndpoint` doesn't catch `deadLetterChannel` sends** — Three different approaches were tried (exact URI, wildcard, `mockEndpointsAndSkip`). Camel 4.8.1's error handler sends to the DLQ through an internal code path that bypasses route-level interceptors. This cost ~5 iteration cycles and significant debugging time. The spec assumption (based on `DlqFlowTest`'s success) was incorrect — `DlqFlowTest` works because its route (`helm-render`) is `from("direct:...")` natively; the difference in behavior when `replaceFromWith` is used warrants further investigation.

- **MockGitProvider filesystem leak was an unplanned third bug** — The original analysis identified two defects (async race + dedup leak). A third — `MockGitProvider.reset()` not cleaning `/tmp/mock-git/` — was masked by the SEDA race. Once synchronous dispatch was in place, this surfaced immediately. Root-cause analysis was straightforward once the symptom (0 commits despite synchronous dispatch) was observed.

- **Dedup-cache-on-retry interaction was not predicted** — The route puts entries in `dedupCache` BEFORE calling `helmTemplateRunner.render()`. On redelivery, the retry hits the dedup guard and "succeeds" without actually retrying the render. This means the DLQ path is never reached for this failure mode. The spec's DLQ-capture requirement assumed the message would reach DLQ, but the actual production behavior is different (and correct — dedup guards retries too).

### Lessons Learned

1. **`interceptSendToEndpoint` does NOT intercept `deadLetterChannel` sends in Camel 4.8.1.** For routes where you need to verify the DLQ path in tests, the error handler target endpoint must be mocked at a different level (e.g., the route already starts from `direct:` without `replaceFromWith`), or verification must be done via Exchange properties post-send.

2. **`MockGitProvider.reset()` must clean filesystem state.** Any mock that creates persistent filesystem artifacts must clean them in its `reset()` method. In-memory state and filesystem state must reset together.

3. **Dedup caches interact with error handler redelivery.** If a cache is populated BEFORE the operation that can fail, retries will hit the cache and "succeed" without retrying the actual operation. This is arguably a production concern (group events that fail helm render are silently dedup-guarded for 60s), but it's out of scope for this change.

4. **Always run with synchronous dispatch in Camel Quarkus tests.** `seda:` in tests introduces races that are never worth the cost. Every `replaceFromWith` in tests should use `direct:` unless testing async behavior specifically.

5. **`@EndpointInject` in Quarkus creates CDI synthetic beans at build time.** If two test classes both declare `@EndpointInject("mock:dlq-capture")`, Quarkus throws a duplicate bean error. Use `context.getEndpoint(...)` instead when the same mock URI appears in multiple test classes.

### Metrics

| Metric | Value |
|--------|-------|
| Lines added (production) | 13 (4 in OrgBootstrapRoute, 9 in MockGitProvider) |
| Lines changed (test) | 37 added, 42 removed (net -5) |
| New dependencies | 0 |
| Test count (unchanged) | 7 |
| Full module test count | 51 |
| Debugging iterations for DLQ intercept | 5 |

### Follow-up Considerations

- **`strengthen-org-bootstrap-tests`** (active change, 6/8 complete) targets the same test file with an injectable-clock approach. This change renders that approach unnecessary — archive or reconcile.
- **Production dedup-before-render** — The dedup cache being populated before render means a transient helm failure dedup-guards the group for 60s. Consider moving `dedupCache.put(groupId, ...)` after successful processing in a future change.
- **`DlqFlowTest` vs `OrgBootstrapIntegrationTest` intercept behavior** — Investigate why `interceptSendToEndpoint` works for `helm-render` (native `direct:` from) but not for `org-bootstrap` (`replaceFromWith` to `direct:`). May be a Camel Quarkus issue worth reporting upstream.
