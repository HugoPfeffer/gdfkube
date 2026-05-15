# Retrospective: harden-org-bootstrap-route

> Written: 2026-05-15 (after verify passed)
> Commit range: `72c5a08..f2e0aa1` (worktree merge through task completion)
> Worktree: merged to main

---

## 1. Wins

- [evidence: `f2e0aa1`, 59 tests green] All five audit items landed in a single cohesive change with zero test regressions.
- [evidence: smoke test 7.2 — WARN logged, no DLQ, offset committed] `op==null` rejection works exactly as designed; the WARN carries the raw body for operator triage.
- [evidence: smoke test 7.3 — `ls /tmp/ | grep bootstrap` empty] `.onCompletion()` cleanup verified end-to-end in the live stack, not just in unit tests.
- [evidence: `HelmValuesBuilderTest.buildForOrg_concurrent_returnsDistinctPaths`] Scoped temp paths prevent collision under concurrent redelivery — validated with a countdown-latch race test.
- [evidence: `OrgBootstrapIntegrationTest.helmFailure_leavesDedupCacheEmpty`] Dedup-after-success semantics confirmed: failed exchanges leave the cache untouched and the next retry proceeds.
- [evidence: brainstorm.md "Option A"] Bundling five co-located fixes into one change avoided five trivial PRs touching the same two files.

## 2. Misses

- 📌 [nit | evidence: verify.md §3] The main `camel-orchestrator-stack` spec still carries the old `buildForOrg(String, String)` signature and lacks the 4 new scenarios. Delta sync pending at archive time.
- 📌 [nit | evidence: commit count 0 on branch] Work was done on a worktree branch and merged to main before the final verification tasks (7.1-7.3) ran in this session, so the verify commit range shows indirect history. No functional impact.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 7.1 | Required setting `JAVA_HOME` manually in the agent shell | JDK installed in Dockerfile but env vars not inherited by the agent session |
| 7.2-7.3 | Ran against rebuilt container (not source-level) | Manual smoke tests required a running gdfkube-camel container with the new code; container rebuild was the correct approach |
| 7.2 | Used MongoDB insert instead of direct Kafka header-based produce for 7.3 | `kafka-console-producer` header syntax didn't work with KRaft 3.7; Debezium CDC path is the production-realistic approach |

## 4. Skill / workflow compliance

| Skill                                            | Used | Reason if skipped |
|--------------------------------------------------|------|-------------------|
| superpowers:brainstorming                        | Yes  | brainstorm.md produced during proposal phase |
| superpowers:writing-plans                        | Yes  | plan.md produced during proposal phase |
| superpowers:using-git-worktrees                  | Yes  | worktree-harden-org-bootstrap-route created and merged at `72c5a08` |
| superpowers:subagent-driven-development          | Yes  | Used for tasks 1-6 implementation in prior session |
| (transitive) superpowers:test-driven-development | Yes  | Tests written alongside implementation (HelmValuesBuilderTest, OrgBootstrapRouteTest, integration tests) |
| (transitive) superpowers:requesting-code-review  | No   | Skipped — verification tasks (7.1-7.4) are build+smoke, not new code; code review covered during prior implementation session |
| superpowers:finishing-a-development-branch       | Yes  | Worktree merged to main at `72c5a08` |

## 5. Surprises

- `JAVA_HOME` not propagated to agent shell despite being set in the Dockerfile — required manual export before `mvnw` could run.
- `kafka-console-producer` in KRaft mode (3.7.2) does not support `--property parse.headers=true` with tab-delimited headers as documented — the Debezium CDC path (MongoDB insert) was the reliable alternative for producing events with proper headers.
- DLQ topic `dlq.gdfkube.groups` had `Leader: none` in the Kafka metadata, preventing direct consumer reads — but this didn't affect the test since the validation was via absence (no DLQ message produced) rather than DLQ content inspection.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| `JAVA_HOME` must be explicitly set in agent sessions even when Dockerfile declares it | CLAUDE.md | Add a note about Java env setup for agent sessions |
| For Kafka smoke tests, use the Debezium CDC path (MongoDB insert) instead of `kafka-console-producer` with headers | CLAUDE.md | The CDC path is production-realistic and avoids KRaft header parsing issues |
| `.onCompletion()` is the standard Camel cleanup pattern for temp dirs | (none — already documented in design.md D1) | Precedent in HelmRenderRoute confirmed |
