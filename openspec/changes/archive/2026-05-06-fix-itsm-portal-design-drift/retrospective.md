# Retrospective: fix-itsm-portal-design-drift

> Written: 2026-05-06 (after verify passed at 12:55)
> Commit range: `1ac59dc..1d5140d` (17 commits on `feature/fix-itsm-portal-design-drift`, plus `8b792a5` verify commit and `c38f908` post-verify CSS reset fix on main)
> Worktree: merged to main

---

## 1. Wins

- [evidence: verify.md §4, 270 → 334 tests, +64 net] Test surface grew by ~24% while consolidating 109 audit findings into 13 work clusters. No tests deleted; growth was net-additive coverage of newly-specified requirements.
- [evidence: commits one-per-task, `restore .app grid layout` … `complete tweaks panel a11y`] Each of the 13 task clusters committed independently with its tests in the same commit. Bisect-friendly history; reverting a cluster reverts both behavior and assertions atomically.
- [evidence: commit `b2e3815`, `App.tsx`, `styles.css:87-126`] One-line wrapper-class fix (`<div className="app" data-density={d}>`) revived ~50 dead CSS rules and the entire utility/sidebar/topbar/main grid. Highest impact-per-line in the change.
- [evidence: commit `1d5140d`, `styles.css` +68 lines, removed duplicate `@keyframes pulse` at line 834] Foundations cleanup deduped CSS keyframes, applied uniform button resets across `.nav-item` / `.menu-item` / `.tab` / `.radio-card`, and added rules for 24 audit-flagged "unstyled" landmark classes.
- [evidence: commit `42ee824`, `TweaksPanel.test.tsx`] TweaksPanel a11y reached parity with the existing `OverrideModal` baseline: focus trap, return-focus, Escape handler. Closed a known WCAG 2.1.2 gap.
- [evidence: commits `b56cb96`, `7e1dd56`] Task 9.5 (Reject-disabled-when-comment-empty) and the pulse-baseline change were both pure UX safeguards — small, testable, and address a future user complaint before it happens.
- [evidence: design.md §D5, verify.md §4 row D5] Spec deltas were scoped page-by-page so each of the 9 capability specs took a focused, reviewable diff rather than one large omnibus update.

## 2. Misses

- 🔴 [blocking root cause | evidence: this entire change exists] The prior `build-itsm-portal` declared done with passing tests + typecheck while 109 visual-fidelity regressions sat unchecked. Tests verified behavior; nothing verified visual parity against the reference handoff. Required a full follow-up change to remediate.
- 🟡 [painful | evidence: verify.md §4 drift warning, `decidedThisSession` widened from `string[]` to `{id, action}[]`] Internal refactor crept into change scope without being called out in design.md upfront. Caught at verify time. Spec-internal — not user-visible — but the design doc should have flagged it before commit.
- 🟡 [painful | evidence: tasks 15.7, 15.8 — inline styles in `TemplateEditor.tsx`, `Approvals.tsx`] Drift symptoms (inline `style={{ padding: ... }}`) had to be hand-removed during foundations cleanup. No lint rule prevents reintroducing them.
- 📌 [nit | evidence: post-verify commit `c38f908`] One more interactive-element CSS reset fix landed after `verify.md` was written, so the verify commit range (`1ac59dc..1d5140d`) doesn't cover the actual final state on main. Verify was right at write-time but stale at archive-time.
- 📌 [nit | evidence: task 17.2 still `[ ]` in tasks.md] By-construction `finishing-a-development-branch` cannot be ticked from inside the verify step. Documented in verify.md but stays as `[ ]` rather than `[~]` or `[x]`. Inconsistent with how 16.1/16.2 were handled in build-itsm-portal.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| (cross-cutting) | `decidedThisSession` widened from `string[]` to `{id, action}[]` | Required to drive the new "Approved today / Rejected today" KPI tiles in task 9.1 — design.md didn't anticipate the storage shape change |
| (cross-cutting) | `UPDATE_FIELD` reducer now upserts (inserts when key not found) | Needed by NewFormPage's draft-mode field editing in task 11.1; additive — existing tests continue to pass |
| 1.2 (banner modifier) | Implemented as toggle on `.app` wrapper rather than as a sibling element | Sibling-element approach would have required restructuring grid template areas; toggle is non-disruptive |
| 17.2 (finishing-a-development-branch) | Left `[ ]` in tasks.md after the branch was actually merged | Workflow rough edge — verify writes the verify file, then merging happens, then nothing comes back to tick 17.2 |

## 4. Skill / workflow compliance

| Skill                                            | Used | Reason if skipped |
|--------------------------------------------------|------|-------------------|
| superpowers:brainstorming                        | ✅   | brainstorm.md present |
| superpowers:writing-plans                        | ✅   | plan.md present, explicitly references subagent-driven-development at the top |
| superpowers:using-git-worktrees                  | ⚠️   | Feature branch used (`feature/fix-itsm-portal-design-drift`, 17 commits per verify §5) — worktree adoption not directly attestable, but isolation was achieved |
| superpowers:subagent-driven-development          | ✅   | Plan explicitly directed agentic workers; one-commit-per-task cadence is the signature pattern |
| (transitive) superpowers:test-driven-development | ✅   | Each task's plan starts with "Step 1 (TEST FIRST)"; +64 tests landed alongside the implementations |
| (transitive) superpowers:requesting-code-review  | ❓   | No code-review artifacts saved; reviews (if any) happened ephemerally |
| superpowers:finishing-a-development-branch       | ⚠️   | Branch was merged to main (commits show on main HEAD), but task 17.2 wasn't ticked |

## 5. Surprises

- The `.app` CSS Grid layout was **already defined** in styles.css since the original port — it was bypassed by an `app-shell > shell > main-col` wrapper chain that had no matching CSS rules. The fix was deleting the wrappers and using the existing grid. CSS was load-bearing in a way that JSX-only review did not surface.
- 24 distinct landmark class names (`.payload-preview`, `.fields-table`, `.cell-input`, `.drag-handle`, `.template-tabs`, `.vars-panel`, `.kv`, `.subtabs`, `.approval-step-head`, `.approval-chain`, `.new-form-page`, `.new-user-page`, `.new-group-page`, `.new-request-page`, `.sessions`, `.row-form-id`, `.row-group-id`, `.row-source-form-id`, `.menu-check`, `.toast-icon`, `.toast-close`, `.user-banner`, `.field-error`, `.page-placeholder`) were emitted from JSX with no matching CSS rule. The original implementation passed all tests because tests query by role/text, not class.
- `@keyframes pulse` was defined twice in `styles.css` (line 567 and 834). The duplicate at line 834 silently overrode the first; deduping it explained why the pipeline animation timing felt "off" beyond just the 4s vs 1.4s baseline difference.
- Reject-without-comment was previously allowed. Adding a comment-required guard was a 1-line change but caught a real demo footgun.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| **Visual parity is a verify-gate requirement when porting from a reference design.** Tests + typecheck do NOT catch CSS drift. Without an explicit visual check, an entire change can declare done while 109 regressions sit hidden. | `openspec/schemas/superpowers-bridge/templates/verify.md` — add a "Visual fidelity (when applicable)" section. Or a new skill `verifying-visual-parity`. | This is the single biggest learning. The miss in build-itsm-portal directly caused this entire 17-commit change |
| **Audit JSX-emitted class names against CSS rules.** Every class name that appears in JSX should have a matching rule. | A small lint script or a verify-step grep, callable from the schema's verify instructions | 24 unstyled class names slipped past review. A `grep -oE 'className="[^"]+"' src/**/*.tsx` ↔ `grep -oE '\.[a-z-]+' styles.css` set-difference would have caught all of them |
| **Ban inline layout styles in lint.** `style={{ padding/margin/grid/flex... }}` in TSX is a drift signal. | `.eslintrc` rule (e.g. `react/forbid-component-props` with `style`), or a project-local lint plugin | Inline-style violations existed in `TemplateEditor.tsx`, `Approvals.tsx` and weren't caught by anything except the audit |
| **Refactors that change persisted/serialized shapes belong in design.md upfront.** `decidedThisSession: string[] → {id, action}[]` was an internal change, but it altered the data model and should have been flagged before implementation. | `superpowers:writing-plans` skill or design.md template guidance | Caught at verify only; should be caught at design |
| **Tick `finishing-a-development-branch` from outside the change.** Either auto-tick on merge, or accept the task will stay `[ ]` and document that explicitly. | Schema definition or finishing-a-development-branch skill | Workflow rough edge inherited from build-itsm-portal too |
| **Reference handoff bundles need a stable extraction path.** Plan task 15 says "extracted at `/tmp/gdfkube-design/...` from prior work, or re-extract if missing." Path is volatile. | `.devcontainer/` or `gdfkube-src/gdfkube-itsm/README.md` | Bake the reference into the devcontainer image or check it into the repo at a known path |
