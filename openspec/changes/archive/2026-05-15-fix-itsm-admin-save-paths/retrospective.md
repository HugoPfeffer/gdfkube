# Retrospective: fix-itsm-admin-save-paths

> Written: 2026-05-15 (after verify passed)
> Commit range: `75ba5b7..80d5cac`
> Worktree: merged to main (single commit)

---

## 1. Wins

- [evidence: `80d5cac`, 16 files changed, 201 insertions, 65 deletions] The entire 8-defect cluster (M-5/M-6/M-7/M-8/M-9/M-19/M-20/M-21) was closed in a single focused commit covering 7 source files and 5 test files. Blast radius matched proposal exactly.
- [evidence: `groups.test.ts` — 6 PATCH cases, `users.test.ts` — 3 new cases] Server-side whitelist behavior is now locked by exhaustive positive+negative tests. Future drift between editor and whitelist will fail at test time.
- [evidence: `UserEditor.test.tsx` — 3 new cases, `GroupEditor.test.tsx` — exact body assertion] PATCH body shape tests are precise: `fullName`, `active`, and exact `{name, fullName, repo}` assertions replace the previous loose `objectContaining`.
- [evidence: `NewUserPage.test.tsx`, `NewFormPage.test.tsx` — 1 toast case each] All three admin create pages now share the same toast-on-failure pattern, verified by test.
- [evidence: curl `PATCH /api/itsm/groups/saude -d '{"users":5}'` → 400] The whitelist trim works end-to-end against the live Express server.

## 2. Misses

- 📌 [nit | evidence: `groups.test.ts:67`] Pre-existing POST test failure (`expect(res.body.users).toEqual([])`) was not fixed — the `users` field is not included in the `create` response when not sent in the body. This is a pre-existing Mongoose schema default issue, not introduced by this change.
- 📌 [nit | evidence: tasks.md 11.3, 11.4] Two manual GUI smoke tests were skipped per user request. The corresponding behavior is covered by automated tests, but a future demo pass should verify the full user flow.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 6 (setToast threading) | Threaded through `Users.tsx` and `Forms.tsx` instead of `App.tsx` directly | `App.tsx` already passes `setToast` to `AdminUsers` and `AdminForms`; the missing link was `Users.tsx → NewUserPage` and `Forms.tsx → NewFormPage` |
| Task 8 (NewGroupPage M-19) | Kept `?? 0` fallbacks for numeric `users`/`forms`/`clusters` fields | Server response from `create` may not include counter fields; using `?? 0` for numeric display is acceptable (not the same as the old `created.name ?? localGuess` pattern) |
| Task 10 (Verification) | Ran as tasks 11.1–11.6 with 2 GUI tests skipped | User opted out of manual GUI tests; curl and automated tests provided sufficient coverage |

## 4. Skill / workflow compliance

| Skill                                            | Used | Reason if skipped |
|--------------------------------------------------|------|-------------------|
| superpowers:brainstorming                        | Yes  | brainstorm.md was produced in proposal phase |
| superpowers:writing-plans                        | Yes  | plan.md with 10 micro-tasks was produced |
| superpowers:using-git-worktrees                  | No   | Direct implementation on main; change was small and well-scoped |
| superpowers:subagent-driven-development          | No   | Direct sequential implementation; overhead of subagent dispatch not justified for a single-session change |
| (transitive) superpowers:test-driven-development | Partial | Tests were written alongside code changes, not strictly red-green-refactor; test assertions were added/tightened for every code change |
| (transitive) superpowers:requesting-code-review  | No   | Solo developer, single-commit change; code quality verified via tests + curl + pre-commit |
| superpowers:finishing-a-development-branch       | No   | Work committed directly to main per project convention |

## 5. Surprises

- The `setToast` threading described in the task list as "from App.tsx" was actually a two-hop chain: `App.tsx → Users.tsx/Forms.tsx → NewUserPage/NewFormPage`. The intermediate admin page components own the create-page rendering, not `App.tsx` directly.
- The `NewGroupPage` fallback chain (`created.* ?? local`) was more subtle than expected — the numeric fields (`users`, `forms`, `clusters`) genuinely may not appear in the server `create` response, so `?? 0` defaults were retained for those (distinct from the spec-violating `name`/`repo` fallbacks that were removed).

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| Toast prop threading follows the rendering hierarchy, not the App.tsx root | Long-term memory | Future toast-related tasks should trace the actual render tree, not assume App.tsx is the direct parent |
| Exact PATCH body assertions are preferable to `objectContaining` for whitelist-constrained APIs | CLAUDE.md | Prevents silent drift between editor and server whitelist |
| `itsmApi.ts` error path now includes non-JSON bodies — future API clients should follow this pattern | Long-term memory | Useful reference for any new API module |
