<!--
Delta spec for camel-orchestrator-stack.
Strengthens testability requirements for the org-bootstrap route:
- A Clock seam so TTL eviction can be exercised deterministically from both sides of the 60s boundary.
- MockGitProvider path-preservation parity with GiteaGitProvider so on-disk placement under orgs/<groupId>/ is actually asserted.
- A stricter restatement of the within-TTL dedup scenario plus an after-TTL re-processing scenario, both pinned to the new Clock seam.
-->

## ADDED Requirements

### Requirement: OrgBootstrapRoute TTL eviction SHALL be driven by an injectable Clock

The `OrgBootstrapRoute` dedup cache MUST read the current time from a CDI-injected `java.time.Clock` (default `Clock.systemUTC()`), not from `System.currentTimeMillis()` directly. The integration test profile MUST register a `MutableClock` alternative that exposes a `advance(Duration)` method so tests can move time forward without sleeping. The Clock seam MUST NOT change the route's observable behavior in production: the default `Clock.systemUTC()` MUST be active under `%prod` and `%dev` profiles, and only the integration test profile MUST resolve the `MutableClock` alternative.

#### Scenario: Production profile resolves the system Clock

- **GIVEN** the `gdfkube-camel` app starts with `QUARKUS_PROFILE=prod`
- **WHEN** `OrgBootstrapRoute`'s injected `Clock` is inspected
- **THEN** it SHALL be a `Clock.systemUTC()`-equivalent (zone `UTC`, drift-free against `System.currentTimeMillis()` at startup)

#### Scenario: Replay within the TTL boundary is suppressed under a fixed clock

- **GIVEN** the route is running under the integration test profile with a `MutableClock` fixed at `t0`
- **AND** an event for group `cultura` has been processed and produced exactly one commit on `gdfkube-orgs`
- **WHEN** the test advances the clock to `t0 + 30s` and replays the same event
- **THEN** no second commit SHALL be produced on `gdfkube-orgs`
- **AND** the dedup cache hit SHALL be the reason (verifiable by toggling cache eviction off in a mutation test, which MUST then fail)

#### Scenario: Replay after the TTL boundary re-processes the event

- **GIVEN** the route is running under the integration test profile with a `MutableClock` fixed at `t0`
- **AND** an event for group `cultura` has been processed
- **AND** the `MockGitProvider` recorded-commits state has been reset
- **WHEN** the test advances the clock to `t0 + 61s` and replays the same event
- **THEN** exactly one new commit SHALL be produced on `gdfkube-orgs` for that group
- **AND** disabling `evictExpired` in the route SHALL cause this scenario to fail (mutation sanity)

---

### Requirement: MockGitProvider SHALL preserve relative paths on commit to mirror GiteaGitProvider

The test-only `MockGitProvider.commitAndPush(workTree, files, message, author)` MUST persist each input `Path` at its position relative to `workTree`, identical to `GiteaGitProvider.commitAndPush`. Flattening to the filename (e.g. `workTree.resolve(file.getFileName())`) is forbidden. The mock's `getCommits(owner, repo)` accessor MUST return paths with their relative prefix preserved (e.g. `orgs/cultura/appproject.yaml`, not `appproject.yaml`). A `getCommittedPaths(owner, repo)` helper MAY be added returning `List<Path>` for terse assertions.

#### Scenario: Mock preserves the orgs/<groupId>/ prefix on commit

- **GIVEN** a test invokes `mockGitProvider.commitAndPush(workTree, [workTree/orgs/cultura/appproject.yaml], …)`
- **WHEN** `mockGitProvider.getCommits(owner, "gdfkube-orgs")` is read
- **THEN** the returned entry SHALL include the path `orgs/cultura/appproject.yaml`
- **AND** the path `appproject.yaml` (flattened) SHALL NOT appear

#### Scenario: First-event integration test asserts full on-disk path placement

- **GIVEN** the route is running with a path-preserving `MockGitProvider`
- **WHEN** the renamed `firstEvent_bootstrapsBothReposAndWritesAllThree` integration test runs an `op=c` event for group `cultura`
- **THEN** the recorded commit on `gdfkube-orgs` SHALL contain exactly these three relative paths: `orgs/cultura/appproject.yaml`, `orgs/cultura/applicationset.yaml`, `orgs/cultura/cultura-clusterset.yaml`
- **AND** pointing `OrgBootstrapRoute`'s write target at `workTree` (instead of `workTree/orgs/<groupId>`) SHALL cause this scenario to fail (mutation sanity)

---

### Requirement: helmRenderFailure_dlq SHALL assert against the DLQ topic and the full mandatory header set

The integration test for the helm-render failure path on `OrgBootstrapRoute` MUST assert at the DLQ producer endpoint, not just at the helm renderer call. The test MUST use Camel `AdviceWith` to redirect the producer URI from `kafka:dlq.gdfkube.groups` to a `MockEndpoint`, MUST expect exactly one message, and MUST assert all 9 mandatory `DlqHeaders.stamp()` headers — at minimum `dlq.routeId == "org-bootstrap"` and `dlq.topic == "dlq.gdfkube.groups"`. The test MUST NOT swallow the route's exception with `try { … } catch (Exception ignored) { … }`.

#### Scenario: DLQ test fails when topic name regresses

- **GIVEN** the rewritten `helmRenderFailure_dlq` test is in place
- **AND** the route is mutated to publish to `dlq.gdfkube.orgs` (wrong topic)
- **WHEN** the integration test runs
- **THEN** the assertion on `dlq.topic == "dlq.gdfkube.groups"` SHALL fail

#### Scenario: DLQ test fails when a mandatory header is dropped

- **GIVEN** the rewritten `helmRenderFailure_dlq` test is in place
- **AND** `DlqHeaders.stamp()` is mutated to omit `dlq.errorClass`
- **WHEN** the integration test runs
- **THEN** the `expectedHeaderReceived("dlq.errorClass", …)` assertion SHALL fail
