## Design Summary

Execute the six unchecked verification tasks (2.5, 7.1–7.6) on the archived `auto-provision-org-resources-from-group-events` change. Capture verbatim command output into a new `evidence/` directory inside the archived change folder, then flip the corresponding `[ ]` → `[x]` in `tasks.md`. Treat the run as a *capstone*: sequence it after the other Camel-side hardening plans land, so the gates exercise current, non-stale code.

Failing gates do **not** get a tick; instead, file a follow-up openspec change and add a `[ ] 7.x-blocked-by-<change-id>` line. This preserves the audit trail and avoids the original failure mode — code-complete, evidence-pending — that this change exists to close.

## Alternatives Considered

### Option A: Run gates immediately against current archived state
- **Approach**: Execute all six gates right now against the code as it currently stands, before any other hardening plans land.
- **Pros**: Fastest path to ticking boxes; no cross-plan coordination.
- **Cons**: Several other in-flight plans (`harden-org-bootstrap-route`, `strengthen-org-bootstrap-tests`, `declare-missing-kafka-topics-and-mongo-signals`) change the very behavior these gates exercise. Re-running gates after they land would either be wasted effort the first time or yield evidence against stale code.
- **Why not chosen**: Evidence captured against stale code is worse than no evidence — it gives a false-green signal and re-introduces the audit's exact failure mode.

### Option B: Automate gates in CI before running
- **Approach**: Wire the six gates into `.github/workflows/` first, then let CI produce the evidence artifacts.
- **Pros**: Repeatable; future-proof; removes the human-in-the-loop entirely.
- **Cons**: Two of the six gates (7.4 Debezium snapshot replay, 7.5/7.6 SPA E2E) require an interactive devcontainer + browser session and are not trivially CI-portable. Scope creep delays the actual evidence capture by weeks.
- **Why not chosen**: This change must close the audit finding now. Automation is a separate, larger plan and is explicitly out of scope here.

### Option C: Run gates as a capstone, after sequenced predecessors (Agreed)
- **Approach**: Sequence after the three Camel-side hardening plans. Run the six gates manually, save command output verbatim into `evidence/`, tick the boxes, file follow-ups for any failure.
- **Pros**: Evidence is against the *final* code; the gates are doing their job (catching regressions in the hardened paths); preserves the failure-routing discipline.
- **Cons**: Has cross-plan dependencies — cannot start until the predecessors are landed.
- **Why not chosen**: This *is* the chosen approach.

## Agreed Approach

Option C — capstone execution. The change blocks no implementation work and is itself blocked by three other Camel-side plans. Output of each gate lands in `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/evidence/<gate>.txt`. Once all six gates pass and their boxes are ticked, the audit finding for the underlying change is closed and the archive entry is complete.

## Key Decisions

- **Evidence format**: Verbatim command output (or its tally line for noisy suites). Screenshots accepted only where browser interaction is unavoidable (7.5, 7.6 noop check via Gitea UI).
- **Failure routing**: Failing gate → new openspec change + linked `[ ] 7.x-blocked-by-<id>` line in the original `tasks.md`. No silent re-runs, no quiet retries.
- **Target path**: The original change is now under `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/`. The plan was authored before archival; update path references accordingly.
- **No new gates**: Adding gates is out of scope; tightening existing test assertions is covered by `strengthen-org-bootstrap-tests`.
- **Pre-commit**: `pre-commit run --all-files` must be green after evidence lands — no secret bleed from logs.

## Open Questions

- None blocking. The plan's runbook is concrete enough to execute directly; any ambiguity resolves to "capture what the command printed."
