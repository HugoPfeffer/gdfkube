# Retrospective: add-gitea-settings

> Written: 2026-05-13 (after verify passed)
> Commit range: `b37e23f..3dd13aa`
> Worktree: merged to main

---

## 1. Wins

- [evidence: `b37e23f`] Singleton-with-fixed-`_id` (`_id: 'gitea'`) pattern made the API surface trivial: one collection, one document, one upsert. No pagination, no list endpoints, no ambiguity about "which" settings doc.
- [evidence: `gdfkube-infra/mongodb/seed-collections.js`] `$setOnInsert` semantics for `gitea_settings` correctly diverged from the rest of the seeder (which uses `replaceOne`). The deliberate deviation — with an inline comment — kept admin-edited config safe across re-seeds while leaving all other demo fixtures resettable.
- [evidence: `server/__tests__/settings.test.ts`] 10-scenario backend suite (added retroactively by `fix-gitea-settings-review`) covers the full validation matrix: admin GET/PATCH, non-admin 403, missing-doc 404, bad URL/owner/empty-token/null-body 400. Mirrors `groups.test.ts` exactly so maintenance cost stays near zero.
- [evidence: `server/src/openapi.yaml`] Settings routes are documented in the OpenAPI spec, keeping the existing contract-test gate honest.

## 2. Misses

- 🔴 [blocking | evidence: `pages/admin/Settings.tsx` pre-`3dd13aa`] Hard-coded `X-Demo-User: maria.costa` header in the raw `fetch` calls. The single feature whose purpose is an audit trail (`updatedBy`) recorded the wrong user. Caught by the `/review-team` audit, not by Task 7 verification.
- 🔴 [blocking | evidence: `scripts/export-seed-data.mjs` pre-`3dd13aa`] Adding the settings projection regressed the users/groups projections in the same script — `username` dropped, numeric `groups.users/forms/clusters` coerced to `[]`. Resulted in a 401 storm on a fresh `mongo-seed` because `App.tsx::pickUser` looks up by `username`. Task 7.2 verified `settings.json` was generated but did not diff the rest of the regenerated tree.
- 🟡 [painful | evidence: `__tests__/settings.test.ts` is in commit `3dd13aa`, not `b37e23f`] Backend tests for the new routes were not written despite Task 7.x checkboxes being ticked. The premature-completion signal was masked by the green checkmarks.
- 🟡 [painful | evidence: `shell/__tests__/Topbar.test.tsx` diff in `3dd13aa`] Topbar test for the new Settings menu item was missing on initial landing. The audit-confirmed reality was that the menu rename + handler had no regression coverage.
- 📌 [nit | evidence: `specs/itsm-admin-settings/spec.md` pre-`3dd13aa`] Spec required reuse of `src/forms/validate.ts` for field validation. That helper expects a dynamic `Field` object built by the form-builder; three static inputs cannot consume it. The implementer routed around with inline regexes — correct call, but the spec was the wrong source of truth until the amendment landed.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 6.2 (validation reuse) | Used inline regex constants matching `GiteaSettings.ts` `match` validators instead of `validate.ts` | The shared helper expects a `Field` object; static inputs cannot consume it. Spec corrected in `fix-gitea-settings-review` task 7. |
| 7.x (verification) | Initial verification was insufficient — type-check + build + seed export check passed, but no automated tests existed for the new API surface | Closed retroactively by `fix-gitea-settings-review` adding `settings.test.ts` and Topbar assertions before archive. |

## 4. Skill / workflow compliance

| Skill                                            | Used | Reason if skipped |
|--------------------------------------------------|------|-------------------|
| superpowers:brainstorming                        | ✓    | `brainstorm.md` resolved the singleton-vs-multi-doc and `$setOnInsert`-vs-`replaceOne` decisions before implementation |
| superpowers:writing-plans                        | ✓    | `plan.md` enumerated 7 task groups with file-level granularity |
| superpowers:using-git-worktrees                  | ✗    | Solo developer; landed on a working branch without a dedicated worktree |
| superpowers:subagent-driven-development          | partial | Implementation used Cursor; review used `/review-team` |
| (transitive) superpowers:test-driven-development | ✗    | Tests written *after* the audit caught the gap, not before. This is precisely the gap the audit surfaced. |
| (transitive) superpowers:requesting-code-review  | ✓    | `/review-team` was the gate that surfaced the four blockers and three smaller defects |
| superpowers:finishing-a-development-branch       | partial | Merged after `fix-gitea-settings-review` corrected the audit findings, before archive |

## 5. Surprises

- The Cursor-generated implementation marked Task 7.x verification checkboxes as `[x]` while the actual verification it ran was narrow (only `settings.json` shape, only `typecheck && build`). The premature-complete signal was indistinguishable from a real complete signal by reading `tasks.md` alone.
- `pickUser` silently fell back to matching by `name` field-by-field when `username` was missing, producing a "Maria Costa" lookup that returned 401 — the bug looked like a session/auth issue rather than a seed-export shape issue.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| TDD before claiming task completion | CLAUDE.md / `superpowers:verification-before-completion` | "Backend tests for new routes are part of the task, not a follow-up. Ticking a verification checkbox without running automated tests against the new API is a premature-complete." |
| `/review-team` audit catches what self-verification misses | already promoted (re-used in `fix-gitea-settings-review`) | Confirmed value: caught 4 blockers + 3 smaller + 1 spec inaccuracy that the implementer did not see. |
| Seed-export script: pure projection only, no transformation | `.claude/rules/` candidate | "When extending an exporter, every existing field is load-bearing. Add new emission; do not mutate the existing shape. Diff the regenerated tree before committing." |
| Cross-component header injection lives in `itsmApi`, not page-local `fetch` | already in the codebase | Reinforced: new pages route through `itsmApi`; a page-local `fetch` for an authed endpoint is a code-smell. |

---

## Follow-up work

| Item | Priority | Suggested change |
|---|---|---|
| Encryption-at-rest for the PAT in Mongo | LOW | Out of scope for the demo; vault/K8s-secret integration deferred per `design.md` |
| Optimistic concurrency on PATCH (If-Match) | LOW | No concurrent admins in the demo; deferred |
| Real auth replacing `X-Demo-User` | repo-wide | Pre-existing pattern; not a regression introduced here |
