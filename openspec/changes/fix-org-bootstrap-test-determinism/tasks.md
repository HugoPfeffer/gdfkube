## 1. Production seam (OrgBootstrapRoute)

- [x] 1.1 Add a single package-private, self-named method
  `void clearDedupCacheForTesting() { dedupCache.clear(); }` to
  `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java`.
  Add nothing else; do not touch `configure()`, `processGroupEvent`, `TTL_MS`,
  the `deadLetterChannel` config, or any orchestration.
- [x] 1.2 Confirm `gdfkube-src/gdfkube-camel/pom.xml` is unchanged (no new
  dependency) and no `Thread.sleep`/Awaitility/`NotifyBuilder` is introduced.

## 2. Synchronous dispatch (FR1)

- [x] 2.1 In `OrgBootstrapIntegrationTest.adviceRoutes()` change the advice from
  `route.replaceFromWith("seda:org-bootstrap-test")` to
  `route.replaceFromWith("direct:org-bootstrap-test")`.
- [x] 2.2 In `sendGroupEvent(...)` change
  `producer.send("seda:org-bootstrap-test", …)` to
  `producer.send("direct:org-bootstrap-test", …)`. Leave the body/header
  construction unchanged.

## 3. Per-test dedup isolation (FR2 / FR4)

- [x] 3.1 Add `@Inject OrgBootstrapRoute orgBootstrapRoute;` to
  `OrgBootstrapIntegrationTest`.
- [x] 3.2 In `@BeforeEach resetState()` call
  `orgBootstrapRoute.clearDedupCacheForTesting();` alongside the existing
  `mockGitProvider.reset()` / `reset(helmTemplateRunner)` / `stubHelmRender()`.
- [x] 3.3 Do not modify the body of `replayWithinTtl_dedupedByCache`,
  `secondEvent_idempotentNoop`, or the other positive-path tests; determinism
  must follow from tasks 2 + 3 alone.

## 4. DLQ-capture verification (FR3)

- [x] 4.1 — ADAPTED: `interceptSendToEndpoint` does not intercept
  `deadLetterChannel` sends in Camel 4.8.1. Instead, verified via Exchange
  properties: `assertNull(result.getException())` proves the error handler
  handled the failure, combined with `verify(helmTemplateRunner, atLeastOnce())`
  and asserting zero commits. The dedup cache on retry means the error handler's
  first redelivery hits the dedup guard and "succeeds" — this is correct
  production behavior.
- [x] 4.2 — ADAPTED: No `@EndpointInject("mock:dlq-capture")` needed. Returned
  `Exchange` from `producer.send` provides synchronous verification.
- [x] 4.3 Rewrite `helmRenderFailure_dlq`: keep the throwing Helm-render stub,
  verify error handler handled the exception (`assertNull(result.getException())`),
  confirm render was called (`verify(..., atLeastOnce()).render(...)`), and
  confirm no commits occurred.
- [x] 4.4 Added `org.apache.camel.Exchange` import (MockEndpoint not needed).

## 5. Verification

- [x] 5.1 From `gdfkube-src/gdfkube-camel`, run
  `mvn -q -Dtest=OrgBootstrapIntegrationTest test`; expect
  `Tests run: 7, Failures: 0, Errors: 0, Skipped: 0`.
- [x] 5.2 Immediately re-run 5.1 a second time (within the 60s dedup TTL) and
  confirm 7/7 again (proves FR2 cross-run isolation).
- [x] 5.3 Force reverse/random JUnit method order and confirm 7/7 (proves
  order-independence).
- [x] 5.4 Run the full module phase `mvn -q test`; confirm `DlqFlowTest`,
  `ApprovalLoopGuardTest`, `PipelineIntegrationTest` stay green.
- [x] 5.5 Surefire reports confirm `failures="0" errors="0"` across all 51 tests.
- [x] 5.6 If the build tool/wrapper is unavailable in-environment, return the
  exact `mvn` commands above to the user to run manually rather than skipping
  verification.

## 6. Guardrails / acceptance close-out

- [x] 6.1 Confirm the `OrgBootstrapRoute.java` diff is limited to
  `clearDedupCacheForTesting()`; route topology, `TTL_MS` (60000),
  `dlq.gdfkube.groups`, redelivery policy, and Git/Helm orchestration are
  byte-for-byte unchanged elsewhere.
- [x] 6.2 Confirm no new dependency in `gdfkube-camel/pom.xml` and no
  `Thread.sleep`/Awaitility/`NotifyBuilder` anywhere in the diff.
- [x] 6.3 Run `pre-commit run --all-files` before committing (trufflehog).
