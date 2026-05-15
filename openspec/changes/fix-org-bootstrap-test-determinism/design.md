## Context

`OrgBootstrapIntegrationTest` (7 `@Test` methods, `@TestInstance(PER_CLASS)`)
fails 6/7 on every run. Two independent harness defects:

1. **Async race.** `@BeforeAll` rewires the route:
   `AdviceWith.adviceWith(context, "org-bootstrap", r -> r.replaceFromWith("seda:org-bootstrap-test"))`.
   `sendGroupEvent` does `producer.send("seda:org-bootstrap-test", …)`. SEDA is
   asynchronous: the route runs on a SEDA worker thread while `producer.send`
   returns immediately on `main`. Assertions (`repoExists`, `getCommits`,
   `verify(helmTemplateRunner…)`) execute before the route creates repos,
   commits, or calls Helm — hence `expected:<true> but was:<false>`,
   `expected:<1> but was:<0>`, and Mockito "zero interactions".

2. **Cross-test dedup leak.** `OrgBootstrapRoute` is `@ApplicationScoped` with a
   process-lifetime `private final ConcurrentHashMap<String,Long> dedupCache`
   (TTL 60s, `OrgBootstrapRoute.java:39`, guard at `:104-108`). `@BeforeEach`
   resets only `MockGitProvider` and the `HelmTemplateRunner` mock — never the
   dedup cache. Once any test fully processes groupId `"cultura"`, every later
   test reusing that id returns at the dedup guard inside `processGroupEvent`
   with no repos/commits/Helm calls. `deleteEvent_dropped` passes incidentally:
   `__op="d"` is rejected synchronously (`accepted=false`,
   `OrgBootstrapRoute.java:81-86`) before any async/dedup work.

Reference patterns in the same module already solve both problems:
`ApprovalLoopGuardTest` uses `replaceFromWith("direct:request-router-input")` +
`producer.sendBodyAndHeaders("direct:…")` + `assertIsSatisfied(...)`;
`DlqFlowTest` uses
`interceptSendToEndpoint("kafka:dlq.…").skipSendToOriginalEndpoint().to("mock:dlq-capture")`
+ `mockDlq.assertIsSatisfied(45000)`.

Constraints: solo developer; project values minimal, drift-free changes and
modifying existing methods over adding new ones. No new test dependencies,
sleeps, or polling. Production route behavior must stay functionally unchanged.

## Goals / Non-Goals

**Goals:**
- 7/7 deterministically: every run, repeated runs within the 60s TTL, any
  JUnit method order.
- Assertions observe a fully-processed exchange (no `main` vs worker race).
- Per-test dedup isolation independent of method order and TTL.
- `helmRenderFailure_dlq` verified by a captured DLQ endpoint, not a racing
  Mockito `verify`.
- Reuse module patterns; zero new dependencies.

**Non-Goals:**
- No production logic change to `OrgBootstrapRoute` (topology, 60s TTL, DLQ
  topic `dlq.gdfkube.groups`, redelivery policy, Git/Helm orchestration).
- No injectable-clock / time-abstraction refactor of the dedup TTL.
- No MongoDB, `StageUpdater`, `AuditInterceptor`, or Dev Services changes (not
  on the org-bootstrap path).
- No changes to `DlqFlowTest`, `ApprovalLoopGuardTest`,
  `PipelineIntegrationTest` (already synchronous, already pass).

## Decisions

### D1 — `direct:` synchronous dispatch instead of SEDA

`@BeforeAll`: `replaceFromWith("direct:org-bootstrap-test")`; `sendGroupEvent`:
`producer.send("direct:org-bootstrap-test", …)`. A `direct:` consumer runs the
route synchronously on the caller thread, so `producer.send` blocks until
`processGroupEvent`, Git bootstrap, Helm render, commits, and dead-letter
routing complete.

Sequence (before → after):

```
Before (SEDA):  main: producer.send ──┐ returns immediately
                                      └─> SEDA worker: process… commit… (LATE)
                main: assertEquals(1, commits) → sees 0   ❌

After (direct): main: producer.send → process… commit… → returns
                main: assertEquals(1, commits) → sees 1   ✅
```

*Alternatives:* (a) `NotifyBuilder.whenDone(1)` or Awaitility on SEDA — adds
polling and (Awaitility) a new dependency; strictly worse than removing the
asynchrony. (b) `Thread.sleep` — flaky, forbidden. **`direct:` chosen**: zero
deps, exactly the proven `ApprovalLoopGuardTest` pattern, no timeouts on the
happy path.

### D2 — Test-only `clearDedupCacheForTesting()` on the route

Add one package-private, self-named method to `OrgBootstrapRoute`:
`void clearDedupCacheForTesting() { dedupCache.clear(); }`. Test injects the
`@ApplicationScoped` bean (`@Inject OrgBootstrapRoute`) and calls it from
`@BeforeEach` next to `mockGitProvider.reset()` / `reset(helmTemplateRunner)`.

*Alternatives:* (a) Disable dedup via a test-profile flag — breaks
`replayWithinTtl_dedupedByCache`, which needs dedup active *within* a test.
(b) Reflection to clear the private field from the test — brittle, obscure,
worse maintainability than a named seam. (c) Injectable clock to age entries
past TTL — explicit Non-Goal, larger production refactor, and doesn't address
the async race. **Named reset chosen**: smallest, self-documenting,
deterministic regardless of order/TTL; mirrors the intent of
`MockGitProvider.reset()`. It is the single deliberate production-side touch.

### D3 — DLQ verified via `mock:dlq-capture`

`@BeforeAll` advice adds
`interceptSendToEndpoint("kafka:dlq.gdfkube.groups").skipSendToOriginalEndpoint().to("mock:dlq-capture")`.
Test injects `@EndpointInject("mock:dlq-capture") MockEndpoint mockDlq`, resets
it in `@BeforeEach`, and asserts `mockDlq.assertIsSatisfied(timeout)` with the
existing helm-render stub throwing. Timeout sized to the route's redelivery
policy (`OrgBootstrapRoute.java:61-67`: 3 redeliveries, 1000ms initial, ×5.0
backoff ≈ 1+5+25s worst case) — use 45000ms, consistent with `DlqFlowTest`. An
optional post-completion `verify(helmTemplateRunner)` may remain (now safe
under D1); the DLQ-capture assertion is the source of truth.

### D4 — `replayWithinTtl_dedupedByCache` determinism falls out of D1+D2

With clean dedup per test (D2) and synchronous sequential sends (D1): first
send → exactly 1 commit; second send, same groupId, same test, within TTL →
deduped at the guard → still 1 commit. No clock manipulation; both sends are
well inside the 60s window in one test. The test's existing mid-test
`mockGitProvider.reset()` + `createRepo` is left intact (not a `@BeforeEach`
concern).

## Risks / Trade-offs

- **[A production class gains a test-only method]** → Mitigation: single
  package-private method named `clearDedupCacheForTesting()`; no production
  caller, no behavioral path touched; acceptance criterion explicitly bounds
  the production diff to this method.
- **[`@Inject OrgBootstrapRoute` returns a different instance than the running
  route]** → Mitigation: the route is `@ApplicationScoped` (single CDI
  instance); the same bean backs the registered Camel route, so clearing its
  cache affects the live route. Verified implicitly by 7/7 + repeat-run
  determinism (FR2 acceptance criterion 2).
- **[deadLetterChannel marks the exchange handled, so `producer.send` does not
  throw]** → Mitigation: keep the `try/catch (Exception ignored)` around the
  send (mirrors `DlqFlowTest`); correctness rests on
  `mockDlq.assertIsSatisfied`, not on a thrown exception.
- **[DLQ timeout too tight for exponential backoff]** → Mitigation: 45000ms,
  matching `DlqFlowTest`'s proven value for the same redelivery shape.
- **[Other async route tests share this anti-pattern]** → Out of scope; they
  currently pass on the synchronous pattern. Revisit only if they flake.

## Migration Plan

No runtime migration. This is a test-harness fix plus one test-only method:

- **MongoDB schema**: none — org-bootstrap path injects neither MongoDB nor
  `StageUpdater`.
- **Kafka consumer-group rebalancing**: none — `kafka:dlq.gdfkube.groups` is
  *intercepted in the test only* (`skipSendToOriginalEndpoint`); no real
  producer/consumer, topic config, or group `gdfkube-camel` is touched.
- **Helm values**: none.
- **Deploy**: ships with the test source; no container/image/chart change.
- **Rollback**: revert the change; production behavior is unaffected either
  way since the route logic is untouched.

## Open Questions

- None blocking. Coordination note: `strengthen-org-bootstrap-tests` (6/8
  complete) targets the same test file via the rejected injectable-clock
  approach. Deciding which lands and archiving the other is a project-level
  call outside this artifact.
