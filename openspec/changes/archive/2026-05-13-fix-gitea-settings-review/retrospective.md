# Retrospective: fix-gitea-settings-review

> Written: 2026-05-13 (after verify passed)
> Commit: `3dd13aa`
> Worktree: merged to main

---

## 1. Wins

- [evidence: `3dd13aa` single commit, 944+/208- across 24 files] Bundling all four blockers + three smaller defects + one spec amendment into one PR made the reviewability trivial: every fix is contextualised against the audit finding that produced it, and `main` never sat in a half-broken intermediate state.
- [evidence: `server/__tests__/settings.test.ts`] Backend test suite (10 scenarios) mirrors `groups.test.ts` layout exactly. Maintenance cost is near zero — anyone familiar with `groups.test.ts` can navigate `settings.test.ts` without reorientation.
- [evidence: `src/api/itsmApi.ts` + `pages/admin/Settings.tsx`] Routing the page through `itsmApi.settings` removed the hard-coded `X-Demo-User: maria.costa` bug at its root: header injection is centralised in one place (the `api` helper consuming `demoUserResolver()`), so no future leaf page can re-introduce the same audit-trail bug.
- [evidence: `scripts/export-seed-data.mjs` diff] Reverting the seed-export script to a pure projection restored `users.username` and numeric `groups.users/forms/clusters`. Demo login worked again on a fresh `mongo-seed`.
- [evidence: tasks 7.1, 7.2] The spec amendment edited the in-flight `add-gitea-settings` source instead of fabricating a delta against an unarchived capability. The archived `add-gitea-settings` will now be self-consistent.

## 2. Misses

- 🟡 [painful | evidence: tasks 8.5–8.10 deferred] The Compose smoke walkthrough was punted to the next change (`add-local-gitea-compose`) because no local Gitea existed at the time of this fix. Acceptable because the unit-level coverage was strong, but it does mean the Settings UI was not exercised end-to-end against a live API during this change's verification.
- 📌 [nit | evidence: 17 files changed across SPA, server, scripts, seeds, OpenAPI, two openspec change directories] The bundled fix touched a lot of surface area. Worth it for the reviewability gain (D1), but anyone bisecting `3dd13aa` later will have to grep through a wide diff to find a specific fix.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 8.1 (server-side `npm test`) | Tests exist and pass under the shared vitest harness; the discrete server-only invocation was rolled into 8.2 | Single command runs both suites; separate task became redundant. |
| 8.5–8.10 (Compose walkthrough) | Deferred to `add-local-gitea-compose` | No local Gitea stack existed yet; the walkthrough requires a live endpoint. The corrective fix is provable at the unit level; the integration smoke moved to the change that introduces the integration target. |

## 4. Skill / workflow compliance

| Skill                                            | Used | Reason if skipped |
|--------------------------------------------------|------|-------------------|
| superpowers:brainstorming                        | ✓    | `brainstorm.md` enumerated the four chained blockers and three smaller defects from the audit; D1 (one bundled PR) was the explicit output |
| superpowers:writing-plans                        | ✓    | `plan.md` mapped each finding to a task |
| superpowers:using-git-worktrees                  | ✗    | Solo developer; landed on a working branch |
| superpowers:subagent-driven-development          | partial | Implementation used Cursor |
| (transitive) superpowers:test-driven-development | ✓    | Backend tests written as part of this change, not deferred — the missing-tests finding was itself the gap being closed |
| (transitive) superpowers:requesting-code-review  | ✓    | The change exists *because* `/review-team` was used on `add-gitea-settings`; the same audit pattern can be applied here on demand |
| superpowers:finishing-a-development-branch       | ✓    | Merged on `main` ahead of `add-gitea-settings` archive |

## 5. Surprises

- The `validate.ts` reuse requirement in `add-gitea-settings/spec.md` was technically infeasible because the helper expects a `Field` object built by the form-builder, not static inputs. The implementer of the parent change worked around with inline regexes — correct call, but it meant the spec was wrong-by-construction. Caught only because the challenger agent in the audit checked spec ↔ code alignment.
- A seed-export "improvement" silently broke unrelated downstream consumers (`App.tsx::pickUser`, `Users.tsx`). The lesson generalises: seed-export scripts have many readers; touching one branch of the projection can break others. Always diff the full regenerated tree before committing.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| When fixing audit findings, bundle the corrective scope into one PR | already validated here; usable as a pattern | "Don't sequence chained fixes across multiple PRs — `main` between them is partial-broken in confusing ways. One PR keeps verification a single walkthrough." |
| Spec amendments to in-flight changes edit the parent in place; no delta needed | `.claude/rules/` candidate or openspec docs | "If the capability has not been merged to `openspec/specs/`, edit the in-flight change's source files. Reserve deltas for amendments to *already-archived* capabilities." |
| Seed-export scripts are pure projections | `.claude/rules/` candidate | "Touching an exporter without diffing the full regenerated tree is a silent-downstream-break risk. Always diff `users.json`, `groups.json`, etc., not just the new file." |
| Page-local `fetch` for an authed endpoint is a code smell | already informally; consider a lint or codereview rule | "Centralised header injection only works if every page uses the helper. A raw `fetch` to `/api/itsm/...` should fail review." |

---

## Follow-up work

| Item | Priority | Suggested change |
|---|---|---|
| Replace `X-Demo-User` with real auth | repo-wide / out-of-scope | Pre-existing demo pattern; not in this corrective scope |
| Optimistic-concurrency `If-Match` on PATCH | LOW | Demo-grade gap; no concurrent admins |
| Encryption-at-rest for the PAT | LOW | Accepted risk in original `design.md` |
| Vault / K8s Secret integration for token storage | LOW | Explicit non-goal in original `design.md` |
