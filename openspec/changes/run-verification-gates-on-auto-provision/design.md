## Context

The `auto-provision-org-resources-from-group-events` change (archived 2026-05-14) shipped with six unchecked verification tasks (`2.5`, `7.1`–`7.6`) in its `tasks.md`. CLAUDE.md mandates *"verification before completion."* The codebase audit (`CODEBASE-AUDIT-2026-05-14.md`, X-1) and the placeholder report (§4 "High") name this as the canonical failure mode: implementation complete, evidence absent.

Three other in-flight Camel-side plans (`harden-org-bootstrap-route`, `strengthen-org-bootstrap-tests`, `declare-missing-kafka-topics-and-mongo-signals`) modify the very behavior these gates exercise. Running the gates before those plans land yields evidence against stale code — the same false-green signal the audit is trying to eliminate. So this change is a *capstone*: it cannot move until those three are merged.

Stakeholders are narrow: solo developer (Hugo). No external consumers depend on the evidence files; the audit trail is the consumer.

## Goals / Non-Goals

**Goals:**
- Produce 6 verbatim evidence artifacts (one per gate) under a new `evidence/` subdirectory of the archived change folder.
- Tick `[ ]` → `[x]` in the archived `tasks.md` for each passing gate, one-to-one with the corresponding evidence file.
- Route every failing gate to a new openspec change + a `[ ] 7.x-blocked-by-<change-id>` line — no silent retries.
- Keep `pre-commit run --all-files` green after evidence lands (trufflehog must not flag captured logs).

**Non-Goals:**
- Adding new verification gates (separate test-quality plan).
- Rewriting the existing tests (covered by `strengthen-org-bootstrap-tests`).
- Automating the gates in CI (separate plan; would extend `.github/workflows/`).
- Modifying any production code under `gdfkube-src/`.
- Re-opening the archived change. The archive directory entry remains; only `tasks.md` checkboxes and a new `evidence/` directory are added inside it.

## Decisions

**D1. Capture verbatim command output, not summaries.**
Each gate writes the full stdout/stderr tail (or the meaningful tally line for very noisy suites) into `evidence/<gate>.txt`. Rationale: the audit explicitly rejects "tests passed locally" claims without a log. Trade-off: larger evidence files, but they're text and trufflehog-safe.

**D2. Evidence lives inside the archived change folder, not in this proposing change's folder.**
The archive entry is the audit-of-record for the original change; placing evidence anywhere else creates the drift this codebase rejects. Alternative considered: a sibling `evidence/` directory at the repo root — rejected, fragments the trail.

**D3. Capstone sequencing — block on three predecessors.**
Stale-evidence is worse than late-evidence. Alternative considered: run now, re-run later — rejected, doubles manual work and pollutes the evidence file timestamps.

**D4. Failing-gate routing: new openspec change + blocked-by line.**
A failing gate is a real defect signal, not a re-run trigger. Alternative considered: comment in `tasks.md` with stack trace — rejected, breaks the convention that `tasks.md` is a checklist, not a bug tracker.

**D5. Manual execution for 7.4–7.6.**
The Debezium snapshot replay and the SPA create/edit flows require an interactive devcontainer + browser. Automating them is out of scope (Non-Goal). Trade-off: depends on operator discipline; mitigated by D1 (verbatim capture).

**D6. Path update for archived change.**
The plan was authored against `openspec/changes/auto-provision-org-resources-from-group-events/`; the change has since moved to `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/`. All file references in tasks/plan use the archived path. Alternative considered: un-archive temporarily — rejected, archival is the audit anchor and must not be reversed for cosmetic reasons.

**D7. No spec under `openspec/specs/`.**
The new capability `auto-provision-verification-evidence` is recorded only as the change-scoped spec under `specs/` of this change. It does not graduate to the global `openspec/specs/` tree because the requirements are tied to one specific archived change, not to an ongoing product surface. Alternative considered: promote to a generic "verification-evidence" capability — deferred until a second instance proves the pattern is reusable; YAGNI for now.

## Risks / Trade-offs

- **Risk**: Operator runs gates against partially-updated code (some predecessors merged, others not). → **Mitigation**: tasks.md step 0 confirms all three predecessors are archived/merged before any gate runs.
- **Risk**: Captured log contains a token, password, or repo PAT. → **Mitigation**: pre-commit `trufflehog` runs before commit; D1 captures only build/test stdout, which shouldn't expose secrets. If a log does include a candidate, sanitise with `# trufflehog:ignore` where intentional, or scrub the field.
- **Risk**: Browser-driven gates (7.5, 7.6) drift from runbook over time. → **Mitigation**: the runbook commands are in `plan.md`; any drift becomes a follow-up plan, not silent edits.
- **Risk**: A predecessor plan introduces a 10th route, breaking `AppStartupIT`'s "9 routes Started" assertion in 7.2. → **Mitigation**: if the assertion changes, the predecessor must update the gate first; this change does *not* loosen the assertion to make the gate pass.
- **Trade-off**: Manual gates 7.4–7.6 are not idempotent across runs (a second create of "Cultura" would conflict with the first). The runbook calls out one-shot semantics; cleanup is the operator's responsibility before re-running.
- **Trade-off**: Evidence files are committed to the repo. Storing logs in source control feels heavy, but it makes the audit trail durable and reviewable; the volume is small (~6 short text files).

## Migration Plan

This change has no runtime migration:
- No MongoDB schema change (the gates *query* existing collections, they do not write).
- No Kafka consumer group rebalancing (the Debezium connector is *restarted*, not reconfigured with a new group).
- No Helm value change (the stack runs as deployed).

Rollback strategy: if evidence capture introduces a problem (e.g., committed log contains an unexpected secret), `git revert` the evidence-landing commit; the original `tasks.md` returns to all-unchecked. No production impact.
