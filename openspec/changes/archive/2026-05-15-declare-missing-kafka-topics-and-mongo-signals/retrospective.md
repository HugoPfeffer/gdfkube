# Retrospective: declare-missing-kafka-topics-and-mongo-signals

> Written: 2026-05-15 (after verify passed)
> Commit range: `3829d5d..8d9e30e`
> Worktree: merged to main

---

## 1. Wins

- [evidence: `init-topics.sh` grep count = 14, echo = 14] Echo count re-derivation (D6) caught the drift class by design — the plan required counting actual `create_topic` lines rather than trusting a hardcoded number.
- [evidence: task 5.4 — `kafka-init` exit 0, `kafka-topics --list` includes both topics] Clean-stack verification confirmed both topics are created idempotently with `--if-not-exists`.
- [evidence: task 5.5 — `mongosh db.getCollectionNames()` includes `debezium_signals`] The `ensureCollection` guard pattern reuse (D3) kept the change to a single line addition in `init-camel-collections.js`.
- [evidence: task 5.6 — Debezium connector logged signal action] Previously a silent no-op; now the signal pipeline is live end-to-end.
- [evidence: task 5.7 — `./mvnw test` BUILD SUCCESS, 51 tests, 0 failures] All Camel integration tests green, including `helmRenderFailure_dlq` which exercises the `kafka:dlq.gdfkube.groups` dead letter channel.
- [evidence: tasks 3.1–3.4] Spec edits were surgical: one requirement deleted, one catalog bumped from 9→11 with matching scenario text. No spurious changes.
- [evidence: tasks 4.1–4.4] Three README drift-syncs bundled with the code change per D5, closing audit amendments A-23–A-26 in one shot without leaving a half-synced state.

## 2. Misses

- 📌 [nit | evidence: delta spec `kafka-broker-stack/spec.md` ADDED section] The "Debezium signal collection SHALL be declared at bootstrap" requirement was placed in the `kafka-broker-stack` delta spec, but it's a MongoDB concern. A dedicated `mongodb-bootstrap` or `debezium-connect-stack` capability would be a better home. Non-blocking — the requirement content is correct, only its capability assignment is arguable.
- 📌 [nit | evidence: `openspec validate --all`] The main `itsm-groups-collection/spec.md` and `kafka-broker-stack/spec.md` both fail structural validation due to missing `## Purpose` sections. This predates this change and is a known backlog item.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 1.4 (echo count) | Plan predicted 12→14; actual count confirmed as 14 | Count verified empirically per D6, no deviation — plan's prediction was correct |
| 5.7 (Maven tests) | Required explicit `JAVA_HOME` export | Devcontainer ENV not propagated to the agent shell session; no code change needed |
| — | No other deviations | All 23 tasks matched plan scope exactly |

## 4. Skill / workflow compliance

| Skill                                            | Used | Reason if skipped |
|--------------------------------------------------|------|-------------------|
| superpowers:brainstorming                        | Yes  | brainstorm.md produced |
| superpowers:writing-plans                        | Yes  | plan.md produced with micro-tasks |
| superpowers:using-git-worktrees                  | No   | Work was done directly on main; the change was small enough (declarative parity, no runtime code) that isolation was unnecessary |
| superpowers:subagent-driven-development          | No   | Tasks were executed directly by parent agent across sessions; the declarative nature of the change (script lines + spec edits + README touch-ups) made subagent dispatch overhead unnecessary |
| (transitive) superpowers:test-driven-development | N/A  | No new runtime code was written — all changes are declarative bootstrap scripts, specs, and READMEs. TDD does not apply to non-code artifacts |
| (transitive) superpowers:requesting-code-review  | No   | Skipped in favor of the verify artifact and manual clean-stack verification |
| superpowers:finishing-a-development-branch       | No   | Work was committed directly to main (no feature branch to finish) |

## 5. Surprises

- `JAVA_HOME` was not available in the agent shell despite being set in the Dockerfile `ENV`. This required an explicit `export JAVA_HOME=/home/node/.local/jdk` before running Maven tests. Not a code issue, but a devcontainer environment propagation gap for non-login shells.
- The `debezium_signals` collection creation (task 5.6) immediately activated the Debezium signal pipeline. The assumption that "Debezium no-ops silently" was correct, but the flip side — that creating the collection makes signals work instantly — was a pleasant confirmation that no connector restart was needed.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| Echo/count lines in init scripts should always be re-derived from actual invocations, never hardcoded | CLAUDE.md | Pattern applies to any init script with a trailing summary count |
| Delta spec capability assignment should match the infrastructure domain, not the change's primary focus | schema guidance | The "Debezium signal collection" requirement ended up in `kafka-broker-stack` because the change was primarily about Kafka topics, but it belongs in a MongoDB or Debezium capability |
