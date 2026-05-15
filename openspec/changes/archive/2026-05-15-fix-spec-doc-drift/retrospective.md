# Retrospective: fix-spec-doc-drift

> Written: 2026-05-15 (after verify passed)
> Commit range: `uncommitted — single commit during archive-finish`
> Worktree: main checkout (no worktree — docs-only change)

---

## 1. Wins

- [evidence: docs/*.md diffs] All 14 component docs + README updated in one sweep with zero spec-link breakage (sanity check 3.1 confirmed zero MISSING output).
- [evidence: design.md §D3/§D4 tables] Design-as-source-of-truth pattern worked well — every badge and spec list was pre-decided, making implementation mechanical.
- [evidence: tasks.md 20/20 implementation tasks] The task decomposition (per-doc edits → README → sanity checks) mapped 1:1 to the work with no rework.
- [evidence: `grep -hoE 'Implementation Status:' ... | sort -u`] Status vocabulary is now constrained to exactly 5 values across all docs.

## 2. Misses

- 📌 [nit | evidence: tasks.md 4/24 incomplete] Commit/PR tasks (4.1-4.4) were not executable during apply because the schema expected a worktree-based workflow, but this docs-only change ran in the main checkout. Non-blocking.
- 📌 [nit | evidence: `openspec validate --all --json`] 13 pre-existing specs fail validation (missing Purpose sections). Not caused by this change, but the validate-all output is noisy. Candidate for a separate cleanup change.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 5/6 (cross-link check + commit) | Merged into the apply session | Sanity checks are trivial shell commands; splitting them into separate subagent tasks would add overhead with no benefit for a docs-only change. |
| Task 6.4 (open PR) | Skipped | Archive-finish flow handles the commit; PR is out of scope for this workflow. |

## 4. Skill / workflow compliance

| Skill                                            | Used | Reason if skipped |
|--------------------------------------------------|------|-------------------|
| superpowers:brainstorming                        | Yes  | brainstorm.md exists |
| superpowers:writing-plans                        | Yes  | plan.md exists |
| superpowers:using-git-worktrees                  | No   | Docs-only change with no code conflicts; worktree isolation adds no value. |
| superpowers:subagent-driven-development          | No   | All tasks are mechanical text replacements in 15 files; dispatching subagents per doc would be slower than batch edits. |
| (transitive) superpowers:test-driven-development | N/A  | No code changes — no tests to write. |
| (transitive) superpowers:requesting-code-review  | No   | Docs-only; review is a visual diff check against design.md tables. |
| superpowers:finishing-a-development-branch       | No   | Archive-finish flow handles completion. |

## 5. Surprises

- The `docs/README.md` intro paragraph still claims "only the ITSM React frontend is implemented; everything else is documented here as the target" — this prose is now inaccurate given the new badges, but it was explicitly out of scope (design §Non-Goals: no body rewrites). A follow-up should fix it.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| Docs re-drift risk: no automated check exists to catch future badge staleness | openspec/config.yaml retrospective rules | Add a `docs:` step requiring future archives to update affected component docs. Flagged in design.md Risks. |
| README intro paragraph contradicts the new badges | Follow-up change | One-line prose fix: remove the "only ITSM is implemented" claim. |
| 13 specs fail validation (missing Purpose sections) | Follow-up change | Batch fix for pre-existing spec format issues. |
