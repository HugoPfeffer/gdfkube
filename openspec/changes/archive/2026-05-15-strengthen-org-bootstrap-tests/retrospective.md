## Retrospective

**Change:** strengthen-org-bootstrap-tests
**Schema:** superpowers-bridge
**Date:** 2026-05-15

### What went well

- **Clean separation of concerns**: The Clock seam, MockGitProvider fix, and DLQ test rewrite were independent enough to implement in parallel via subagents, reducing wall-clock time.
- **Existing patterns guided implementation**: `DlqFlowTest`'s `AdviceWith` + `MockEndpoint` pattern was directly reusable for the DLQ test rewrite; no new test infrastructure needed.
- **MockGitProvider fix was surgical**: Changing `file.getFileName()` to `workingTree.relativize(file)` was a one-line fix that unlocked path-placement assertions across all tests.
- **MutableClock eliminated sleep-based TTL testing**: The `Clock` seam is a standard JDK pattern and adds zero external dependencies.
- **Cross-change bookkeeping (A-37/A-38)** was straightforward since the archived change's tasks.md was accessible.

### What was challenging

- **DlqHeaders header names diverge from the plan**: The plan referenced `dlq.routeId`, `dlq.topic`, etc., but the actual `DlqHeaders.stamp()` uses `x-original-topic`, `x-error-class`, `x-first-failure-at`, etc. Implementation required reading the source to enumerate the correct headers.
- **MockGitProviderTest needed updating**: The existing unit tests created temp files outside the workTree, which broke when `commitAndPush` switched to `workingTree.relativize(file)`. Fixed by creating files inside the workTree.
- **TestClockProducer scope**: The `@Alternative @Priority(1)` pattern in Quarkus activates globally for all test profiles, not just `OrgBootstrapIntegrationTest`. Acceptable because no other test depends on wall-clock time for correctness, and the `@BeforeEach` resets the clock.

### Decisions made during implementation

1. **Clock producer on OrgBootstrapRoute itself** (not a separate `ClockProducer` bean): Matches the smallest-surface-area principle; the route is the only consumer.
2. **`interceptSendToEndpoint` over `weaveByToUri`** for DLQ mock: Mirrors the `DlqFlowTest` pattern exactly; more reliable for error handler endpoints than URI weaving.
3. **Static `TestClockProducer.getMutableClock()`** accessor: Avoids CDI lookup complexity in the test class; the singleton is safe because `@BeforeEach` resets it.
4. **10 headers asserted, not 9**: `DlqHeaders.stamp()` sets 10 headers (including `x-original-key`). The plan referenced "9 mandatory headers" but the implementation asserts the 6 most critical ones (`x-error-class`, `x-error-msg`, `x-first-failure-at`, `x-replayed`, `x-stage`, `x-attempts`) with `isNotNull()` checks for variable-value headers.

### Lessons for future changes

- **Read the actual source, not the plan's line-number references**: Line numbers shift between changes; always grep and read the file.
- **Unit tests for mocks need updating alongside the mock**: When fixing `MockGitProvider`, the unit test `MockGitProviderTest` broke because it used `Files.createTempFile` (outside the workTree). Always check mock-level tests.
- **Quarkus CDI alternatives are global**: `@Alternative @Priority(1)` cannot be scoped to a single `@TestProfile` in Quarkus. Document this if test isolation becomes a concern.
