# Retrospective: rollback-demo-argocd-instance

> Written: 2026-06-02 (after verify passed)
> Commit: `40b7f71` on `worktree-rollback-second-argocd` (based on `main-openshift`, not yet merged)

---

## 1. Wins

- [evidence: commit `40b7f71`; `git grep gdfkube-gitops gdfkube-src/` → no matches] The rollback landed as a single coherent commit: 3 deletions, 3 renames (`git mv` preserved history for the discovery bundle + template), and targeted one-line namespace flips in the two chart templates.
- [evidence: `design.md` D1; `org-repos-discovery.yaml` still uses `http://gitea.gdfkube.svc:3000`] Chose surgical edits over `git revert`, which correctly preserved the in-cluster Gitea DNS fix (`b555a75`) and avoided a collision with the later `org-provision-via-request-pipeline` merge. A blanket revert would have regressed a good change.
- [evidence: `helm template platform … | grep gdfkube-org-discovery` shows sync-wave `-8`, `org-discovery` path; `kubectl kustomize` renders one ApplicationSet] Reused the existing `_helpers.tpl` includes and the Application-wraps-a-bundle convention, so the discovery wiring stayed GitOps-managed with zero new patterns.
- [evidence: `openspec validate --all` → 16 failed vs historical 17] Adding a `## Purpose` section to `argocd-org-stack` during the spec rewrite also cleared one of the long-standing repo-wide validation failures — a small, free tech-debt reduction.
- [evidence: `AskUserQuestion` answers recorded in `brainstorm.md`] The three design decisions (discovery wiring, sync policy, OpenSpec formality) were confirmed before implementation, so there was no rework.

## 2. Misses

- 🟡 [painful | evidence: first `Write` to the published specs failed the bg-isolation guard; then `EnterWorktree` branched from `main` (default) not `main-openshift`, so the `argocd-demo` files were absent until `git reset --hard main-openshift`] The worktree was created from the wrong base branch. Cost a detour. Root cause: the bg worktree default base is `origin/<default-branch>` (`main`), but this work lives on `main-openshift`. Caught quickly via an `ls` check.
- 🟡 [painful | evidence: `openspec validate` ERROR "must contain SHALL or MUST" on the Discovery ADDED requirement] The validator scans only the requirement's **first line** for SHALL/MUST; my `MUST` had wrapped to line 2. Easy fix (reflow), but a non-obvious linter rule worth remembering when authoring multi-line requirement statements.
- 📌 [nit | evidence: `docs/ARCHITECTURE.md` is untracked in the working copy] Two stale `gdfkube-gitops` mentions in `ARCHITECTURE.md` could not be updated — the file is untracked and absent from the worktree. Deferred to the user post-merge.

## 3. Plan deviations

| Plan item | What changed | Why |
|-----------|--------------|-----|
| Published spec edits | Applied the deltas to the published specs during implementation rather than deferring to `/opsx:archive`'s sync step | The sync is agent-driven (no apply CLI); doing it inline produced the identical end state and was verified by `openspec validate`. Recorded as "already synced" in `verify.md` §3. |
| Discovery bundle | Renamed dir `argocd-demo/` → `org-discovery/` (not in the original one-liner ask) | Eliminate-drift: keeping a dir named `argocd-demo` for a non-demo single-instance discovery bundle would be misleading. |

## 4. Skill / workflow compliance

| Skill | Used | Reason if skipped |
|-------|------|-------------------|
| superpowers:brainstorming | Partial | Decisions gathered via plan-mode `AskUserQuestion`; written into `brainstorm.md` from those answers (manual-fallback path). |
| superpowers:writing-plans | Yes | Plan authored in plan mode (`.claude/plans/…`) and distilled into OpenSpec `plan.md`. |
| superpowers:using-git-worktrees | Yes | Work isolated in `worktree-rollback-second-argocd` (after re-basing onto `main-openshift`). |
| superpowers:test-driven-development | N/A | Manifest/spec-only change; `helm template` + `kubectl kustomize` + `openspec validate` are the assertion layer. |
| superpowers:verification-before-completion | Yes | Renders, lint, grep, and validate run before claiming completion (see `verify.md`). |
| superpowers:finishing-a-development-branch | Pending | Fires at merge into `main-openshift` (out of scope for archive). |

## 5. Surprises

- The OpenSpec validator's "first-line SHALL/MUST" heuristic — two near-identical ADDED requirements behaved differently purely because of where the line wrapped.
- `EnterWorktree`'s default base ref is the repo default branch, not the currently checked-out branch; on a repo whose active work is on a non-default branch (`main-openshift`), this needs an explicit re-base.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| When authoring OpenSpec requirements, keep `MUST`/`SHALL` on the requirement's first line | OpenSpec authoring notes / writing-plans | The validator only scans the first line; wrapped modal verbs fail validation. |
| For work on `main-openshift`, create the worktree from that branch (or `git reset --hard main-openshift` after) | CLAUDE.md or a project note | The bg worktree defaults to `origin/main`; platform manifests live only on `main-openshift`. |
| Prefer surgical edits over `git revert` when a feature's follow-up commits also carry unrelated good fixes | `.claude/rules/` workflows | A blanket revert here would have undone the in-cluster Gitea DNS fix. |
