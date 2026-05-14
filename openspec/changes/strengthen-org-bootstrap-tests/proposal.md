## Why

Three integration tests for `OrgBootstrapRoute` (`helmRenderFailure_dlq`, `replayWithinTtl_dedupedByCache`, `firstEvent_bootstrapsBothReposAndWritesAllFour`) are green but do not enforce the contracts their names imply: the DLQ test swallows exceptions and asserts only that `helm template` was called, the TTL test fires two back-to-back events without crossing the 60s boundary, and the first-event test only checks filenames while `MockGitProvider` silently flattens paths. A regression in DLQ headers, TTL eviction, or `orgs/<groupId>/` placement would ship undetected. Auditor amendments A-37 (rename) and A-38 (un-tick 5.8) hinge on this fix landing.

## What Changes

**OrgBootstrapRoute TTL determinism**
- From: TTL eviction reads `System.currentTimeMillis()` directly; no seam for tests.
- To: TTL eviction reads `clock.millis()` from an injected `java.time.Clock`; default `Clock.systemUTC()`, integration tests get a `MutableClock`.
- Reason: Required to assert both sides of the 60s boundary deterministically and without `Thread.sleep`.
- Impact: Non-breaking; one production line changes.

**MockGitProvider path parity**
- From: `commitAndPush` flattens to `workTree.resolve(file.getFileName())`, hiding any regression in target path.
- To: Preserve the relative path via `workTree.relativize(file)` to mirror `GiteaGitProvider.commitAndPush`. `getCommits` returns prefixed paths.
- Reason: Closes H-3; existing callers' assertions are updated to match.
- Impact: Test-only; affects every test that consumes `MockGitProvider.getCommits`.

**`helmRenderFailure_dlq` rewrite**
- From: `try { sendGroupEvent } catch (ignored) {}` + `verify(helmTemplateRunner)` — proves nothing about DLQ.
- To: `@EndpointInject("mock:dlq.gdfkube.groups")` `MockEndpoint`, advise kafka producer to mock, assert message count and all 9 mandatory `DlqHeaders.stamp()` headers (`dlq.routeId=org-bootstrap`, `dlq.topic=dlq.gdfkube.groups`, `dlq.errorClass`, etc.).
- Reason: Closes H-6; mirrors `DlqFlowTest` pattern.
- Impact: Test-only; no production change.

**`replayWithinTtl_dedupedByCache` + `replayAfterTtl_reprocesses`**
- From: Two back-to-back events, asserts second produces no commit. Permanent cache with no eviction would still pass.
- To: First test advances `MutableClock` by 30s and asserts dedup. New companion `replayAfterTtl_reprocesses` advances by 61s and asserts re-processing.
- Reason: Closes H-12.
- Impact: Test-only.

**`firstEvent_bootstrapsBothReposAndWritesAllFour` rename + path assertion**
- From: Method name embeds the stale "four files" count (A-37); assertions only check filename presence.
- To: Renamed to `firstEvent_bootstrapsBothReposAndWritesAllThree`; assert committed paths include `orgs/cultura/appproject.yaml`, `orgs/cultura/applicationset.yaml`, `orgs/cultura/cultura-clusterset.yaml`. Update reference in `openspec/changes/auto-provision-org-resources-from-group-events/tasks.md:41`.
- Reason: Aligns name with current 3-file emission and asserts the path placement that `OrgBootstrapRoute:162` is responsible for.
- Impact: Test-only.

**Cross-change bookkeeping (A-38)**
- From: `openspec/changes/auto-provision-org-resources-from-group-events/tasks.md:47` task 5.8 marked `[x]` despite the test not asserting DLQ.
- To: Flipped to `[ ]` with a note; re-ticked once the rewritten test lands and runs green (handled by the verify phase of `run-verification-gates-on-auto-provision`).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `camel-orchestrator-stack`: Tighten testability requirements for `OrgBootstrapRoute` (TTL seam, DLQ header contract, path-placement assertion) and the `MockGitProvider` parity invariant.

## Impact

- **Code (production)**:
  - `gdfkube-src/gdfkube-camel/src/main/java/.../OrgBootstrapRoute.java` — inject `java.time.Clock`; replace `System.currentTimeMillis()` with `clock.millis()` (1 line).
  - New CDI `@Produces` for the default `Clock.systemUTC()` (≤10 LOC, either in `OrgBootstrapRoute` or a small producer class).
- **Code (tests)**:
  - `gdfkube-src/gdfkube-camel/src/test/java/.../OrgBootstrapIntegrationTest.java` — rewrites for the three tests; adds `replayAfterTtl_reprocesses` (~80 LOC delta).
  - `MockGitProvider` (test helper) — `commitAndPush` and `getCommits` (a few lines).
  - New test-only `MutableClock` bean + `@Produces` (≤15 LOC).
- **Cross-change**:
  - `openspec/changes/auto-provision-org-resources-from-group-events/tasks.md` — line 41 (rename) and line 47 (un-tick 5.8 with note).
- **Kafka topics**: `dlq.gdfkube.groups` is asserted against, not renamed.
- **Downstream consumers**: None — purely test and a one-line behavior-preserving seam.
- **Dependencies**: No new libraries; Apache Camel `MockEndpoint` + `AdviceWith` already on the test classpath via Quarkus Camel BOM.
- **Testing strategy**:
  - Integration (`OrgBootstrapIntegrationTest`): the three rewrites + 1 new test.
  - Mutation-style sanity (manual, called out in verify): disabling `evictExpired` must fail `replayAfterTtl_reprocesses`; pointing `OrgBootstrapRoute` write at `workTree` (not `workTree/orgs/<groupId>`) must fail `firstEvent_…_AllThree`.
- **Blast radius**: 1 route, 1 mock, 1 integration test file. No API, Helm chart, MongoDB schema, or Debezium config touched.
