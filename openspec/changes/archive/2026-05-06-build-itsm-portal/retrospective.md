# Retrospective: build-itsm-portal

> Written: 2026-05-06 (after verify passed on 2026-05-05)
> Commit range: `78c9313..c38f908` (49 commits)
> Worktree: merged to main (feature/build-itsm-portal, 33 commits per verify.md §2)

---

## 1. Wins

- [evidence: `gdfkube-src/gdfkube-itsm/src/forms/GenericRequest.tsx` + commit `e3dbe08`] One generic form runner replaced what would have been three bespoke per-form components. Adding a new request type is now a data edit (`adminSeeds.ts`) instead of a code change — confirmed by the catalog test "new form id renders with generic chrome" (task 8.4).
- [evidence: commit `e9a2f8a`, `src/state/dataContext.tsx`, test `dataContext.test.tsx`] Reducer-backed context made admin edits propagate to consumer pages without prop-drilling. The "missing id is a no-op" reducer behavior was pinned in a separate test commit (`b031241`) before consumers depended on it.
- [evidence: `verify.md` §1, `openspec validate --all --json`] Structural validation passed cleanly on first verify run — no spec/proposal/design drift among the 9 capability deltas.
- [evidence: `.github/workflows/gdfkube-itsm-ci.yml`, task 1.8] CI is path-filtered to `gdfkube-src/gdfkube-itsm/**`, so unrelated repo changes don't trigger the JS pipeline. Lower noise, faster signal.
- [evidence: commits `18a18f3`, `9794e5f`, `a9c7f90`, `e478144`, `42ee824`] A11y was layered in incrementally (keyboard nav, aria-live toasts, escape-to-close, focus management) rather than retrofitted at the end. Each commit is small and reviewable.
- [evidence: 270 unit/component tests, verify.md context] Test coverage was sufficient that the Playwright spec being unrunnable locally (see misses) did not leave a real gap — the four key transitions (operator submit → admin approve → status change → list refresh) are all covered by component-level tests.

## 2. Misses

- 🟡 [painful | evidence: commits `1ac59dc..c38f908` — 17 follow-up commits, `fix-itsm-portal-design-drift` proposal] Initial implementation passed tests and types but drifted visually from the reference HTML bundle. CSS reset behavior, landmark layout, banner styles, and pipeline animation timing all diverged silently. Required a separate change proposal to restore parity. Tests + typecheck were not sufficient signal for "looks right."
- 🟡 [painful | evidence: tasks 16.1, 16.2, verify.md §2] Playwright is unrunnable in the devcontainer: `npx playwright install --with-deps` requires sudo, and the chromium-headless-shell binary fails to load `libnspr4.so` without system deps. Spec was authored and CI-gated via the `e2e` label, but the local feedback loop is missing. Future devcontainer rebuilds should bake in the system deps.
- 📌 [nit | evidence: commit `bc6944f`] Scale-request template was originally named `nodepool.yaml` per task 3.3, but the backend pattern is a patch (`nodepool-patch.yaml`). Renamed mid-flight. Plan should have specified intent, not the literal filename.
- 📌 [nit | evidence: tasks 1, 2, 3, 4 commits `7c6d204`, `1a3ef96`, `00cc936`, `5858169`] Four standalone "mark task N complete" commits add noise to the log without changing code. Could have been folded into the implementing commit.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 3.3 (scale-request template) | Renamed `nodepool.yaml` → `nodepool-patch.yaml` | Backend consumes a patch, not a full nodepool spec — caught during implementation review |
| 9.6 (NewRequest) | Plan implied per-form pages were possible; implementation collapsed all form types into `GenericRequest` | Single runner driven by `adminSeeds.fields[formId]` is the only sensible architecture once you allow admins to edit fields. Decision baked into design.md but not until task 9 was underway |
| 16.1 / 16.2 (Playwright) | Marked `[~]` (env-blocked, CI-gated) instead of `[x]` | Devcontainer cannot install system deps without sudo. Spec authored, runtime deferred to CI |
| 17.2 (docs/ index) | Marked `[ ]` with N/A | Repo has no `docs/` index. Plan's "only if exists" guard tripped |
| (post-tasks) | Spawned follow-up change `fix-itsm-portal-design-drift` | 17 commits of CSS/layout restoration after initial tasks were marked done. See miss #1 |

## 4. Skill / workflow compliance

| Skill                                            | Used | Reason if skipped |
|--------------------------------------------------|------|-------------------|
| superpowers:brainstorming                        | ✅   | brainstorm.md present in change directory |
| superpowers:writing-plans                        | ✅   | plan.md present, 17 phases, micro-tasks per phase |
| superpowers:using-git-worktrees                  | ⚠️   | Feature branch (`feature/build-itsm-portal`) used per verify §2, but no `.git/worktrees/` evidence — likely worked on the branch directly in the main checkout |
| superpowers:subagent-driven-development          | ❓   | Not directly attestable from commits; commit cadence (one phase per commit) suggests sequential implementation rather than dispatched subagents |
| (transitive) superpowers:test-driven-development | ✅   | Every component/page has a paired `*.test.tsx` (Vitest + Testing Library). 270 tests at completion |
| (transitive) superpowers:requesting-code-review  | ❓   | No code-review artifacts saved; reviews (if any) happened ephemerally |
| superpowers:finishing-a-development-branch       | ✅   | Branch merged to main, worktree cleaned up before this retro was written |

## 5. Surprises

- The reference HTML bundle's `styles.css` was load-bearing in ways the initial port didn't preserve. Porting JSX + types + tests was not enough — the CSS itself encoded layout invariants (grid templates, landmark positioning, animation timings) that needed to be carried over verbatim. This drove the entire `fix-itsm-portal-design-drift` follow-up.
- Devcontainer + Playwright is a structural mismatch: Playwright's installer wants root to install system libs, devcontainers run as non-root by default. Discovered late in task 16.
- The "no Generated Manifests / Pipeline Activity cards" requirement (task 11.5) was easier to enforce as a negative test than I expected — `expect(screen.queryByText(...)).toBeNull()` made the intent explicit and prevented future regressions.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| When porting from a reference HTML/JSX bundle, visual parity is a first-class acceptance criterion. Tests + typecheck do not catch CSS drift. | CLAUDE.md (project) or a new skill `porting-reference-bundles` | Add a checklist: side-by-side screenshots, computed-style comparison on key landmarks, animation timings asserted. The follow-up `fix-itsm-portal-design-drift` change is the cautionary tale |
| Generic, data-driven form runners beat per-form components when the data shape is admin-editable. | UI pattern note in CLAUDE.md or a skill | Saves N×M maintenance and unlocks runtime extensibility |
| Devcontainer needs Playwright system deps baked into the image, or the dev/CI feedback loop diverges. | `.devcontainer/Dockerfile` change OR `.devcontainer/README.md` note | Either install `libnspr4`, `libnss3`, `libasound2t64`, etc. at image build, or document that e2e is CI-only and rely on the `e2e` label |
| Standalone "mark task N done" commits add log noise. Fold checkbox flips into the implementing commit. | Personal git habit / CLAUDE.md "Git" section | Already covered loosely; could be made explicit |
| Plan tasks should describe intent, not literal filenames or values, when those names are not load-bearing. | `openspec/schemas/superpowers-bridge/templates/plan.md` guidance, or a writing-plans skill note | Avoids forced renames mid-implementation |
