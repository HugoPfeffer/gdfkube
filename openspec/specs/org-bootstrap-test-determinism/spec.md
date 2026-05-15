## Requirements

### Requirement: OrgBootstrapIntegrationTest SHALL dispatch the route synchronously

The `org-bootstrap` route advice in `OrgBootstrapIntegrationTest` MUST rewrite
the route input to a synchronous in-JVM endpoint (`direct:org-bootstrap-test`)
and `sendGroupEvent` MUST send to that same `direct:` endpoint, so that
`producer.send` blocks on the caller thread until the route — including
`processGroupEvent`, Git bootstrap, Helm render, commits, and any dead-letter
routing — has fully completed before any assertion executes. The harness MUST
NOT use SEDA or any asynchronous dispatch for the route under test.

#### Scenario: Positive-path assertions observe a fully-processed exchange

- **GIVEN** `@BeforeAll` advises `org-bootstrap` with
  `replaceFromWith("direct:org-bootstrap-test")`
- **WHEN** a test calls `sendGroupEvent("cultura", …, "c")` which posts to
  `direct:org-bootstrap-test`
- **THEN** `producer.send` SHALL return only after repos are created, the
  commit is pushed, and `helmTemplateRunner.render` has been invoked
- **AND** `mockGitProvider.repoExists(...)` and
  `mockGitProvider.getCommits(...)` SHALL reflect the completed work

#### Scenario: No assertion precedes the corresponding route work

- **GIVEN** the synchronous `direct:` dispatch is in place
- **WHEN** the suite runs and Surefire `system-out` is inspected
- **THEN** no failing assertion SHALL appear before the corresponding Camel
  route log line; route work and assertions SHALL be on the same synchronous
  flow

---

### Requirement: Dedup cache SHALL be isolated per test via a test-only reset hook

`OrgBootstrapRoute` MUST expose a single, explicitly test-named reset method
(`clearDedupCacheForTesting()`) that clears its in-memory `dedupCache`. The
test MUST inject the `@ApplicationScoped` `OrgBootstrapRoute` bean and invoke
this method from `@BeforeEach`, alongside the existing `mockGitProvider.reset()`
and `reset(helmTemplateRunner)`. Dedup MUST NOT be globally disabled via a test
profile — dedup behavior MUST remain active within a single test.

#### Scenario: Reused groupId is processed fresh in every test

- **GIVEN** `@BeforeEach` calls `clearDedupCacheForTesting()` before each test
- **WHEN** multiple tests each send group events for the same groupId
  `"cultura"`
- **THEN** every test expecting processing SHALL observe repos/commits/Helm
  calls, independent of the 60s TTL and of which earlier test ran first

#### Scenario: Suite is order-independent

- **GIVEN** the per-test dedup reset is in place
- **WHEN** the JUnit method order is forced to reverse or random
- **THEN** `OrgBootstrapIntegrationTest` SHALL still report 7 tests, 0
  failures, 0 errors

#### Scenario: Repeated runs within the TTL window stay green

- **GIVEN** the suite has just completed once
- **WHEN** the suite is run a second time within 60 seconds (same or new JVM)
- **THEN** it SHALL again report 7/7, proving dedup isolation across runs

---

### Requirement: helmRenderFailure_dlq SHALL verify the error-handler path via Exchange properties

The helm-render failure path MUST be verified by asserting on the returned
`Exchange` after synchronous `direct:` dispatch. With the deadLetterChannel
error handler active, `producer.send` returns an exchange where:
- `getException()` is null (error handler handled the failure)
- `helmTemplateRunner.render()` was invoked at least once (route attempted render)
- No commits were produced (bootstrap did not succeed)

**Note:** `interceptSendToEndpoint` does NOT intercept `deadLetterChannel` sends
in Camel 4.8.1 when the route's from-endpoint was replaced via `replaceFromWith`.
Additionally, the route's dedup cache is populated before render, so error handler
redelivery hits the dedup guard and "succeeds" — the message never actually reaches
the DLQ topic for this failure path. Exchange-based verification is the correct
approach for this route.

#### Scenario: Helm failure is handled by error handler without propagating

- **GIVEN** the Helm-render stub is configured to throw
- **WHEN** `helmRenderFailure_dlq` sends a `"c"` group event for `"cultura"`
- **THEN** `producer.send` SHALL return an Exchange with `getException() == null`
  (proving error handler handled the failure)
- **AND** `verify(helmTemplateRunner, atLeastOnce()).render(...)` SHALL pass
- **AND** `mockGitProvider.getCommits(...)` SHALL be empty (no successful bootstrap)

---

### Requirement: replayWithinTtl_dedupedByCache SHALL be deterministic without clock manipulation

`replayWithinTtl_dedupedByCache` MUST be deterministic without clock
manipulation: with synchronous dispatch and per-test dedup isolation, two
sequential sends of the same groupId within a single test MUST yield exactly
one processed event — the first send MUST produce exactly one commit; the
second send, same groupId, within the TTL and within the same test, MUST be
suppressed at the dedup guard and produce no further commit. No injectable
clock or TTL override SHALL be required.

#### Scenario: Second in-TTL replay is suppressed

- **GIVEN** `clearDedupCacheForTesting()` ran in `@BeforeEach` so the cache is
  clean at test start
- **WHEN** `replayWithinTtl_dedupedByCache` sends `"cultura"` `"c"` twice in
  sequence within the same test
- **THEN** the first send SHALL produce exactly 1 commit on `gdfkube-orgs`
- **AND** the second send SHALL produce no commit (deduped at the guard),
  leaving the post-reset commit list empty

---

### Requirement: The change SHALL introduce no new test dependency and no sleeps

The change MUST use only `camel-quarkus-junit5` primitives already on the
`gdfkube-camel` classpath (`AdviceWith`, `ProducerTemplate`, `MockEndpoint`,
`@EndpointInject`) plus existing Mockito. It MUST NOT add any dependency to
`gdfkube-src/gdfkube-camel/pom.xml`, and MUST NOT introduce `Thread.sleep`,
Awaitility, or `NotifyBuilder`.

#### Scenario: No dependency or sleep is added

- **GIVEN** the change is implemented
- **WHEN** `gdfkube-src/gdfkube-camel/pom.xml` and the test diff are reviewed
- **THEN** `pom.xml` SHALL have no added dependency
- **AND** the test SHALL contain no `Thread.sleep`, no Awaitility, and no
  `NotifyBuilder`

---

### Requirement: OrgBootstrapRoute production behavior SHALL remain unchanged

The production diff MUST be limited to the added test-only
`clearDedupCacheForTesting()` method. Route topology, the 60s dedup TTL, the
DLQ topic `dlq.gdfkube.groups`, the redelivery/backoff policy, and the Git/Helm
orchestration MUST be functionally unchanged.

#### Scenario: Production-side diff is bounded to the test-only reset method

- **GIVEN** the change is implemented
- **WHEN** the diff to `OrgBootstrapRoute.java` is reviewed
- **THEN** the only addition SHALL be `clearDedupCacheForTesting()`
- **AND** route topology, `TTL_MS` (60000), the `deadLetterChannel`
  configuration (`kafka:dlq.gdfkube.groups`, 3 redeliveries, 1000ms delay, ×5.0
  backoff), and `processGroupEvent` orchestration SHALL be unchanged

#### Scenario: Sibling route tests do not regress

- **GIVEN** the change is implemented
- **WHEN** the full `gdfkube-camel` test phase runs
- **THEN** `DlqFlowTest`, `ApprovalLoopGuardTest`, and
  `PipelineIntegrationTest` SHALL remain green

---

### Requirement: MockGitProvider.reset() SHALL clean filesystem state

`MockGitProvider.reset()` MUST delete the `/tmp/mock-git/` directory recursively
in addition to clearing the in-memory `repos` map. Filesystem state and in-memory
state MUST be reset together to prevent cross-test pollution when routes complete
synchronously under `direct:` dispatch.

#### Scenario: Filesystem is clean after reset

- **GIVEN** a test has run and `MockGitProvider` created directories under
  `/tmp/mock-git/`
- **WHEN** `mockGitProvider.reset()` is called in `@BeforeEach`
- **THEN** `/tmp/mock-git/` SHALL not exist (or be empty)
- **AND** subsequent tests SHALL not find pre-existing files from prior tests
