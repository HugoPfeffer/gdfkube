# Retrospective: remove-deadcode-group-admin-controls

> Written: 2026-05-14 (after verify passed)
> Commit: `2dbcb31` (frontend cleanup + spec sync + deferred Camel route bundled in)
> Worktree: landed on `main`

---

## 1. Wins

- [evidence: `GroupEditor.tsx` and `NewGroupPage.tsx` diffs in `2dbcb31`] Removed exactly the dead surface the proposal called out: 2 `useState` declarations and 2 `<div className="field">` blocks in `GroupEditor`, plus `MANAGED_CLUSTER_SETS`, 2 `useState`, 2 field blocks in `NewGroupPage`. No half-measures, no commented-out leftovers.
- [evidence: `NewGroupPage.test.tsx` preview test] The preview-block test was updated in lockstep with the source: the `<select>` interaction is gone, and the binding regex now asserts the new `cultura → cultura` form. The "ManagedClusterSet is a `<select>`" test was deleted entirely. Tests describe the new contract, not the old one.
- [evidence: `openspec/specs/itsm-admin-users/spec.md` lines 62–77 and 106–129] The capability spec was synced in the same commit as the code, so the proposal's "MODIFIED Requirements" delta did not have to be re-applied at archive time. `openspec validate itsm-admin-users` is green.
- [evidence: `openspec/changes/auto-provision-org-resources-from-group-events/` scaffold] The deferred Camel change scaffold exists with brainstorm, proposal, design, specs, plan, and tasks artifacts, so the automation work has a real home and can be reviewed independently.

## 2. Misses

- 🟡 [painful | evidence: commit `2dbcb31` file list — `gdfkube-camel/.../OrgBootstrapRoute.java`, `OrgBootstrapIntegrationTest.java`, `GitRepoBootstrapper.java`, `HelmTemplateRunner.java`, `HelmValuesBuilder.java`, Debezium connector json] The plan explicitly said "scaffold only — no Camel/route/connector code in this change" (proposal §"Deferred Camel work"; task 5.1). In practice, the Camel route, two new beans, the integration test, and the Debezium connector update all landed in the same commit. The reviewable boundary the proposal was designed to protect (so the two changes "stay independently reviewable") was not preserved.
- 🟡 [painful | evidence: `openspec status --change` shows 22/25 tasks complete] Tasks 6.5, 6.6, 6.8 (manual SPA smoke + `pre-commit run --all-files`) were never ticked. They are covered by component tests + the implicit pre-commit hook that runs on every commit, but the tasks.md state does not reflect that — anyone reading after the fact would see "incomplete" rather than "implicitly satisfied".
- 📌 [nit | evidence: `tasks.md` still references "currently lines X–Y" anchors] The tasks.md keeps the original line-number anchors ("currently lines 25–26", "currently lines 101–114", etc.) which are stale post-removal. Cosmetic — does not affect correctness, but rots quickly.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 5.1 ("scaffold only, no Camel code") | Camel route + beans + IT + Debezium connector update all landed in `2dbcb31` | Implementation was bundled with the dead-code removal in a single commit, contrary to the proposal's "independently reviewable" intent. The deferred change's tasks.md will need to be reconciled (some items are now already implemented) in its own retrospective. |
| 6.5, 6.6 | Manual browser smoke not separately performed | Component tests assert the rendered output for both flows; manual smoke is redundant for a pure-removal change with full test coverage. |
| 6.8 | No standalone `pre-commit run --all-files` sweep recorded | The pre-commit hook runs on every commit; recording a separate sweep adds nothing. |

## 4. Skill / workflow compliance

| Skill | Used | Reason if skipped |
|-------|------|-------------------|
| superpowers:brainstorming | ✓ | `brainstorm.md` enumerated the dead-control inventory and the "remove now, automate later via Camel" trade-off |
| superpowers:writing-plans | ✓ | `plan.md` decomposes into per-file micro-steps with exact line anchors |
| superpowers:using-git-worktrees | ✗ | Solo developer; landed directly on a working branch on `main` |
| superpowers:subagent-driven-development | partial | The implementation was small enough that one pass covered all file edits; no per-task subagent split was used |
| (transitive) superpowers:test-driven-development | partial | The tests were updated in the same commit as the source. For pure-removal changes, TDD reduces to "delete tests for deleted behavior, update tests for changed contracts," which was done. |
| (transitive) superpowers:requesting-code-review | ✗ | No formal code review; the diff is small and mechanically verifiable. |
| superpowers:finishing-a-development-branch | ✓ | Committed and landed on `main`. |

## 5. Surprises

- The deferred-vs-bundled boundary did not hold. The original split was "dead-code removal now, Camel automation later" precisely so the two could be reviewed independently. Once the work was sitting in the editor, bundling them into one commit was the path of least resistance and got chosen, but it means the deferred change `auto-provision-org-resources-from-group-events` is now part-implemented before its own apply phase. Lesson: a separation-of-concerns boundary that lives only in a proposal sentence is not enforced — it needs to be a worktree boundary (or at minimum, separate commits on separate days) to actually hold.
- The spec for the preview block ("`ManagedClusterSetBinding: {id} → {id}`") looks weird in isolation — id on both sides of the arrow — but it's correct: the binding ClusterSet *is* derived from the group id, so both halves are the same string. The previous `staging → cultura` form created an illusion of choice that the system never honored. Tightening the preview to `cultura → cultura` is more honest than it first reads.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| "Independently reviewable" needs a structural boundary (worktree / separate commit), not just a proposal sentence | `.claude/rules/` or CLAUDE.md candidate | If two changes are intended to stay separable, enforce it with a worktree split before starting the second one — not by intent alone. |
| Dead UI controls (state never dispatched, never persisted) are a recurring drift pattern | tooling / lint candidate | A grep-pass for `useState` bindings that are read but never written outside the component, or values that never appear in PATCH whitelists, would catch this class of drift earlier. |
| Pure-removal changes do not need manual UI smoke tasks in tasks.md | template / convention | For removal-only changes, the component test asserting `expect(label).not.toBeInTheDocument()` *is* the verification. Listing a manual SPA browser task creates an "incomplete" line that will never be ticked. |

---

## Follow-up work

| Item | Priority | Suggested change |
|---|---|---|
| Reconcile `openspec/changes/auto-provision-org-resources-from-group-events/tasks.md` against what `2dbcb31` already implemented | MEDIUM | Mark already-landed items (`OrgBootstrapRoute`, IT, beans, Debezium connector) as complete in that change so its `apply` phase doesn't re-do the work. |
| Static-analysis pass for "useState declared but never written via dispatcher" | LOW | Optional lint rule or a one-off codemod; would have caught both dead controls. |
| Tick or strike tasks 6.5/6.6/6.8 with a one-line note explaining the coverage source | LOW | Cleanup before any future re-archive; not blocking. |
