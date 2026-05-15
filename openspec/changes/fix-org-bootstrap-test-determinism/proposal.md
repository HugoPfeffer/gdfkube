## Why

`OrgBootstrapIntegrationTest` fails 6 of 7 tests on every run because the test
harness — not the production route — is broken: the `@BeforeAll` advice routes
through `seda:` so `producer.send` returns before the route finishes (assertions
race the Camel worker), and the `@ApplicationScoped` route's 60s `dedupCache` is
never reset between `@TestInstance(PER_CLASS)` tests, so any later test reusing
groupId `"cultura"` is silently deduped to a no-op. The suite gives no real
signal on org-bootstrap regressions today; fixing it now restores trustworthy CI
for the Camel module with a minimal, drift-free change.

## What Changes

**Test route dispatch (async → synchronous)**
- From: `@BeforeAll` advice `replaceFromWith("seda:org-bootstrap-test")`;
  `sendGroupEvent` calls `producer.send("seda:org-bootstrap-test", …)`.
- To: `replaceFromWith("direct:org-bootstrap-test")`;
  `producer.send("direct:org-bootstrap-test", …)`.
- Reason: `direct:` runs the route synchronously on the caller thread, so
  `producer.send` blocks until repos/commits/Helm/DLQ routing complete —
  assertions observe a fully-processed exchange. Mirrors `ApprovalLoopGuardTest`.
- Impact: Test-only, non-breaking. No production route topology change.

**Per-test dedup isolation**
- From: `@BeforeEach` resets `MockGitProvider` and the `HelmTemplateRunner` mock
  only; `dedupCache` persists across tests for the process lifetime.
- To: Add a single, explicitly test-named `clearDedupCacheForTesting()` method
  to `OrgBootstrapRoute`; inject the bean and call it from `@BeforeEach`.
- Reason: Guarantees clean dedup state per test, independent of method order and
  the 60s TTL, while keeping dedup active *within* a test (required by
  `replayWithinTtl_dedupedByCache`).
- Impact: Single deliberate production-side touch — a test-only method; route
  topology, TTL (60s), DLQ topic, redelivery policy, Git/Helm orchestration
  functionally unchanged.

**`helmRenderFailure_dlq` verification (Mockito verify → DLQ-capture endpoint)**
- From: timing-fragile `verify(helmTemplateRunner, atLeastOnce()).render(...)`.
- To: `@BeforeAll` advice adds
  `interceptSendToEndpoint("kafka:dlq.gdfkube.groups").skipSendToOriginalEndpoint().to("mock:dlq-capture")`;
  test asserts `mockDlq.assertIsSatisfied(timeout)` (timeout sized to the route
  redelivery policy: max 3 redeliveries, 1000ms initial, ×5.0 backoff). An
  optional post-completion Mockito `verify` may remain (now safe).
- Reason: Deterministic dead-letter assertion, mirrors `DlqFlowTest`.
- Impact: Test-only, non-breaking.

## Capabilities

### New Capabilities
- `org-bootstrap-test-determinism`: The deterministic-harness contract for
  `OrgBootstrapIntegrationTest` — synchronous in-JVM dispatch, per-test dedup
  isolation, DLQ-capture verification of the helm-failure path, and the
  no-new-dependency / no-sleep constraint. Production route behavior is
  unchanged; this capability governs only how the suite observes the route.

### Modified Capabilities
- None. Per the change's Non-Goals, `camel-orchestrator-stack` production
  requirements (route topology, 60s dedup TTL, `dlq.gdfkube.groups`, redelivery
  policy, Git/Helm orchestration) are functionally unchanged. The added
  `clearDedupCacheForTesting()` is a test-only seam, not a behavioral
  requirement change.

## Impact

- **Service**: `gdfkube-camel` (Camel orchestrator). Production behavior
  unchanged.
- **Files**:
  - `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/routes/OrgBootstrapIntegrationTest.java`
    — primary changes (route advice, `sendGroupEvent`, `@BeforeEach`, DLQ test).
  - `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java`
    — add `clearDedupCacheForTesting()` only.
  - Reference (unchanged): `DlqFlowTest.java`, `ApprovalLoopGuardTest.java`.
- **Kafka topics**: none modified. `dlq.gdfkube.groups` is only *intercepted in
  the test* (real producer skipped); no broker, topic config, or downstream
  consumer is affected. Consumer group `gdfkube-camel` unaffected.
- **APIs / endpoints**: none.
- **Dependencies**: none added or version-changed. Uses only
  `camel-quarkus-junit5` primitives (`AdviceWith`, `ProducerTemplate`,
  `MockEndpoint`, `@EndpointInject`) and existing Mockito already on the
  `gdfkube-camel` classpath. Explicitly **no** new `pom.xml` dependency
  (no Awaitility, no `NotifyBuilder`) and **no** `Thread.sleep` — adding any
  would conflict with the module's established synchronous test pattern.
- **Testing strategy**:
  - *Integration (`gdfkube-camel`)*: the change is itself the test fix —
    `mvn -Dtest=OrgBootstrapIntegrationTest test` must report 7/7; re-run
    immediately within 60s to prove dedup isolation; reverse/random method
    order must still be 7/7.
  - *Regression*: full `mvn test` to confirm `DlqFlowTest`,
    `ApprovalLoopGuardTest`, `PipelineIntegrationTest` stay green.
  - *Production*: no production logic changes; covered by the unchanged
    `camel-orchestrator-stack` IT/`*IT.java` route-status checks.
  - If the build tool is unavailable in-environment, the exact `mvn` commands
    are returned to the user to run manually rather than skipped.
