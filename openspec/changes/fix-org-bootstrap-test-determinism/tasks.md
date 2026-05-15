## 1. Production seam (OrgBootstrapRoute)

- [ ] 1.1 Add a single package-private, self-named method
  `void clearDedupCacheForTesting() { dedupCache.clear(); }` to
  `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java`.
  Add nothing else; do not touch `configure()`, `processGroupEvent`, `TTL_MS`,
  the `deadLetterChannel` config, or any orchestration.
- [ ] 1.2 Confirm `gdfkube-src/gdfkube-camel/pom.xml` is unchanged (no new
  dependency) and no `Thread.sleep`/Awaitility/`NotifyBuilder` is introduced.

## 2. Synchronous dispatch (FR1)

- [ ] 2.1 In `OrgBootstrapIntegrationTest.adviceRoutes()` change the advice from
  `route.replaceFromWith("seda:org-bootstrap-test")` to
  `route.replaceFromWith("direct:org-bootstrap-test")`.
- [ ] 2.2 In `sendGroupEvent(...)` change
  `producer.send("seda:org-bootstrap-test", …)` to
  `producer.send("direct:org-bootstrap-test", …)`. Leave the body/header
  construction unchanged.

## 3. Per-test dedup isolation (FR2 / FR4)

- [ ] 3.1 Add `@Inject OrgBootstrapRoute orgBootstrapRoute;` to
  `OrgBootstrapIntegrationTest`.
- [ ] 3.2 In `@BeforeEach resetState()` call
  `orgBootstrapRoute.clearDedupCacheForTesting();` alongside the existing
  `mockGitProvider.reset()` / `reset(helmTemplateRunner)` / `stubHelmRender()`.
- [ ] 3.3 Do not modify the body of `replayWithinTtl_dedupedByCache`,
  `secondEvent_idempotentNoop`, or the other positive-path tests; determinism
  must follow from tasks 2 + 3 alone.

## 4. DLQ-capture verification (FR3)

- [ ] 4.1 In `@BeforeAll adviceRoutes()` add, inside the same `adviceWith`
  block, `route.interceptSendToEndpoint("kafka:dlq.gdfkube.groups")
  .skipSendToOriginalEndpoint().to("mock:dlq-capture")` (mirror
  `DlqFlowTest.adviceRoutes()`).
- [ ] 4.2 Add `@EndpointInject("mock:dlq-capture") MockEndpoint mockDlq;` and
  reset it in `@BeforeEach` (`mockDlq.reset()`).
- [ ] 4.3 Rewrite `helmRenderFailure_dlq`: keep the throwing Helm-render stub,
  set `mockDlq.expectedMinimumMessageCount(1)`, send the `"c"` event for
  `"cultura"` inside a `try { … } catch (Exception ignored) {}`, then assert
  `mockDlq.assertIsSatisfied(45000)` (consistent with `DlqFlowTest`, sized to
  3 redeliveries / 1000ms / ×5.0 backoff). Optionally retain a supplementary
  `verify(helmTemplateRunner, atLeastOnce()).render(...)` — DLQ-capture is the
  source of truth.
- [ ] 4.4 Add the imports needed (`org.apache.camel.EndpointInject`,
  `org.apache.camel.component.mock.MockEndpoint`).

## 5. Verification

- [ ] 5.1 From `gdfkube-src/gdfkube-camel`, run
  `mvn -q -Dtest=OrgBootstrapIntegrationTest test`; expect
  `Tests run: 7, Failures: 0, Errors: 0, Skipped: 0`.
- [ ] 5.2 Immediately re-run 5.1 a second time (within the 60s dedup TTL) and
  confirm 7/7 again (proves FR2 cross-run isolation).
- [ ] 5.3 Force reverse/random JUnit method order and confirm 7/7 (proves
  order-independence).
- [ ] 5.4 Run the full module phase `mvn -q test`; confirm `DlqFlowTest`,
  `ApprovalLoopGuardTest`, `PipelineIntegrationTest` stay green.
- [ ] 5.5 Inspect
  `build/surefire-reports/TEST-gov.gdf.camel.routes.OrgBootstrapIntegrationTest.xml`:
  confirm `failures="0" errors="0"`, and that no failing assertion in
  `system-out` precedes the corresponding Camel route log.
- [ ] 5.6 If the build tool/wrapper is unavailable in-environment, return the
  exact `mvn` commands above to the user to run manually rather than skipping
  verification.

## 6. Guardrails / acceptance close-out

- [ ] 6.1 Confirm the `OrgBootstrapRoute.java` diff is limited to
  `clearDedupCacheForTesting()`; route topology, `TTL_MS` (60000),
  `dlq.gdfkube.groups`, redelivery policy, and Git/Helm orchestration are
  byte-for-byte unchanged elsewhere.
- [ ] 6.2 Confirm no new dependency in `gdfkube-camel/pom.xml` and no
  `Thread.sleep`/Awaitility/`NotifyBuilder` anywhere in the diff.
- [ ] 6.3 Run `pre-commit run --all-files` before committing (trufflehog).
