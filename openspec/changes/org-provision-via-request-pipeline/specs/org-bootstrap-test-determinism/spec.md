## MODIFIED Requirements

### Requirement: OrgBootstrapIntegrationTest SHALL dispatch the route synchronously

`OrgBootstrapIntegrationTest` MUST drive the `org-bootstrap` route through its real synchronous in-JVM source `direct:org-bootstrap`, sending an exchange whose `org` property carries the org id, so that `producer.send`/`producerTemplate.send` blocks on the caller thread until the route — including repo bootstrap, Helm render, commits, and any dead-letter routing — has fully completed before any assertion executes. The harness MUST NOT use SEDA, Kafka, or any asynchronous dispatch for the route under test, and MUST NOT construct group CDC documents (the route reads the `org` property, not a group body).

#### Scenario: Positive-path assertions observe a fully-processed exchange

- **GIVEN** the test sends to `direct:org-bootstrap` with the `org` property set to `cultura`
- **WHEN** the send returns
- **THEN** it SHALL return only after repos are created, the commit is pushed, and `helmTemplateRunner.render` has been invoked
- **AND** `mockGitProvider.repoExists(...)` and `mockGitProvider.getCommits(...)` SHALL reflect the completed work

#### Scenario: No assertion precedes the corresponding route work

- **GIVEN** the synchronous `direct:org-bootstrap` dispatch is in place
- **WHEN** the suite runs and Surefire `system-out` is inspected
- **THEN** no failing assertion SHALL appear before the corresponding Camel route log line; route work and assertions SHALL be on the same synchronous flow

---

### Requirement: Dedup cache SHALL be isolated per test via a test-only reset hook

`OrgBootstrapRoute` MUST expose a single, explicitly test-named reset method (`clearDedupCacheForTesting()`) that clears its in-memory `dedupCache`. The test MUST inject the `@ApplicationScoped` `OrgBootstrapRoute` bean and invoke this method from `@BeforeEach`, alongside the existing `mockGitProvider.reset()` and `reset(helmTemplateRunner)`. Dedup MUST NOT be globally disabled via a test profile — dedup behavior MUST remain active within a single test.

#### Scenario: Reused org id is processed fresh in every test

- **GIVEN** `@BeforeEach` calls `clearDedupCacheForTesting()` before each test
- **WHEN** multiple tests each invoke `direct:org-bootstrap` for the same org id `"cultura"`
- **THEN** every test expecting processing SHALL observe repos/commits/Helm calls, independent of the 60s TTL and of which earlier test ran first

#### Scenario: Suite is order-independent

- **GIVEN** the per-test dedup reset is in place
- **WHEN** the JUnit method order is forced to reverse or random
- **THEN** `OrgBootstrapIntegrationTest` SHALL still report 0 failures and 0 errors

---

### Requirement: helmRenderFailure_dlq SHALL verify the error-handler path via Exchange properties

The helm-render failure path MUST be verified by asserting on the returned `Exchange` after synchronous `direct:org-bootstrap` dispatch. With the deadLetterChannel error handler active, the send returns an exchange where:
- `getException()` is null (error handler handled the failure)
- `helmTemplateRunner.render()` was invoked at least once (route attempted render)
- No commits were produced (bootstrap did not succeed)

**Note:** the route's dedup cache is populated only after a successful push, so a failed render leaves the cache empty and does not suppress a retry. Exchange-based verification is the correct approach for this route.

#### Scenario: Helm failure is handled by error handler without propagating

- **GIVEN** the Helm-render stub is configured to throw
- **WHEN** `helmRenderFailure_dlq` sends to `direct:org-bootstrap` with `org = cultura`
- **THEN** the send SHALL return an Exchange with `getException() == null` (proving error handler handled the failure)
- **AND** `verify(helmTemplateRunner, atLeastOnce()).render(...)` SHALL pass
- **AND** `mockGitProvider.getCommits(...)` SHALL be empty (no successful bootstrap)

---

### Requirement: replayWithinTtl_dedupedByCache SHALL be deterministic without clock manipulation

`replayWithinTtl_dedupedByCache` MUST be deterministic without clock manipulation: with synchronous dispatch and per-test dedup isolation, two sequential invocations of `direct:org-bootstrap` for the same org id within a single test MUST yield exactly one processed event — the first invocation MUST produce exactly one commit; the second, same org id, within the TTL and within the same test, MUST be suppressed at the dedup guard and produce no further commit. No injectable clock or TTL override SHALL be required.

#### Scenario: Second in-TTL replay is suppressed

- **GIVEN** `clearDedupCacheForTesting()` ran in `@BeforeEach` so the cache is clean at test start
- **WHEN** `replayWithinTtl_dedupedByCache` invokes `direct:org-bootstrap` for `org = cultura` twice in sequence within the same test
- **THEN** the first invocation SHALL produce exactly 1 commit on `gdfkube-orgs`
- **AND** the second invocation SHALL produce no commit (deduped at the guard), leaving the post-reset commit list empty

---

### Requirement: OrgBootstrapRoute production behavior SHALL remain unchanged

The `org-bootstrap` route's git/helm orchestration MUST remain functionally unchanged from the group-triggered implementation: the 60s dedup TTL (`TTL_MS = 60000`), the `deadLetterChannel` configuration (`kafka:dlq.gdfkube.groups`, 3 redeliveries, 1000ms delay, ×5.0 backoff), the `.onCompletion()` `outputDir` cleanup, the idempotent missing-file rendering, and the commit/push behavior MUST all be preserved. The only intended production changes are: (a) the route source becomes `direct:org-bootstrap` (invoked by `repo-bootstrap`) instead of `kafka:dbz.gdfkube.groups`; (b) the org id is read from the `org` exchange property instead of a parsed group document; and (c) `op`-based event filtering is removed. The `clearDedupCacheForTesting()` test hook MUST remain.

#### Scenario: Orchestration invariants are preserved after the source change

- **GIVEN** the change is implemented
- **WHEN** the diff to `OrgBootstrapRoute.java` is reviewed
- **THEN** `TTL_MS` (60000), the `deadLetterChannel` (`kafka:dlq.gdfkube.groups`, 3 redeliveries, 1000ms delay, ×5.0 backoff), the `.onCompletion()` cleanup, and the render/commit orchestration SHALL be unchanged
- **AND** the only behavioral changes SHALL be the `direct:org-bootstrap` source, the `org`-property input, and the removal of `op`-based filtering

#### Scenario: Sibling route tests do not regress

- **GIVEN** the change is implemented
- **WHEN** the full `gdfkube-camel` test phase runs
- **THEN** `DlqFlowTest`, `ApprovalLoopGuardTest`, and `PipelineIntegrationTest` SHALL remain green
