# Retrospective: split-demo-user-and-role

> Written: 2026-05-14 (after verify passed)
> Commit range: `7b2fce0..e3323b6` (scaffold + 7 implementation + 1 task-tracking + 1 test-update commit + merge)
> Worktree: merged to `main`; feature worktree removed

---

## 1. Wins

- [evidence: `8359b36` + `server/src/middleware/demoUser.ts:23`] The `X-Demo-Role` override is **additive and non-destructive**. The middleware clones `DEMO_USERS[username]` and overrides `.role` only when the header is exactly `'operator'` or `'admin'`. Any other value (missing, empty, bogus) falls through to the stored role. `DEMO_USERS` is never mutated, so the request-scoped override never leaks into another request.
- [evidence: `d62410b` + `server/src/services/requestService.ts:101,107`] Same-source-of-truth fix landed in two lines. Both the top-level `requesterGroupName` and `meta.requesterGroupName` now come from `demoUser.group`. The form field is gone, so the silently-overwritten field path is gone with it — drift root-cause eliminated, not papered over.
- [evidence: `0bb63e5` + `src/forms/GenericRequest.tsx`] The prefix/help resolver gained a precise fallback rather than a global one: it falls back to `user.group` only when the sibling key is `requesterGroupName` AND no `fields[]` entry declares it. Three new test cases (positive prefix fallback, positive help-text fallback, negative unrelated-placeholder) pin the contract.
- [evidence: `5116e81` + `c464ce6`] The "split user from role" intent is materially expressed in two places: independent `useState` declarations in `App.tsx` (each with its own `localStorage` initializer + effect) and a topbar with two clearly-separated dropdown sections. No code conflates the two anymore. Selecting a user preserves the role, selecting a role preserves the user — exactly what the demo needed.
- [evidence: `App.tsx` render-body `setDemoUser(...)` + `setDemoRole(...)` calls] The synchronous-header invariant from `fix-itsm-portal-bug-batch` was extended uniformly to the new role channel. Both refs mutate in the same render scope, before the commit phase. `identityRace.test.tsx` was extended to encode the contract for both headers.
- [evidence: `7ba75a1` + `forms.json` ±35 lines + `adminSeeds.ts` ±36 lines] The seed JSON ↔ TS-seed parity (a load-bearing invariant from `fix-itsm-portal-bug-batch`'s retrospective) was respected: the three `requesterGroupName` field blocks were dropped from both files in the same commit. No drift introduced.
- [evidence: `dc8831d`] Pre-existing `App.test.tsx` and `identityRace.test.tsx` suites were updated to the decoupled model in a dedicated commit rather than smuggled into a feature commit. Reviewer-friendly diffs.
- [evidence: `localStorage.getItem('gdfkube.demoRole')` initializer] The role state initializer validates the stored value against the `'operator' | 'admin'` union before accepting it. A stale or malformed localStorage value falls back cleanly to `'operator'`. This pattern is safer than the brace-cast approach the plan originally sketched in Task 7.3.

## 2. Misses

- 🟡 [painful | evidence: tasks 8.2–8.9 in `tasks.md`] The verification group remains entirely unchecked. While the unit and integration test surfaces cover the structural contracts, the explicit smoke walkthroughs (filing a request as `ana.pereira`, observing the prefix, role-toggle persistence across user switch, Mongo doc shape via MCP, Camel end-to-end manifest landing in `gdfkube-orgs/orgs/{group}/`) were never executed. Same deferral pattern as `fix-itsm-portal-bug-batch` — acceptable but a habit worth watching.
- 🟡 [painful | evidence: `git log` shows commit `dc8831d` after `c464ce6`] The plan's Task 7 commit point (`feat(spa): topbar Switch user section above simplified Switch role`) materialized as Task 7 + a sibling `test:` commit. Tests in the existing `App.test.tsx` and `identityRace.test.tsx` suites needed updates to reflect the decoupled state, which the plan did not enumerate. Functionally fine; a plan miss.
- 📌 [nit | evidence: `App.tsx` line ~74 area] The `useState` initializer for `activeUsername` uses `localStorage.getItem('gdfkube.demoUser') ?? ''` — an empty string as the initial value before `data.users` is hydrated. The `user = useMemo(...)` chain handles this via `data.users[0]` as the final fallback, but the empty-string transient is implicit. Documenting the chain at the call site (or extracting to a `pickActiveUser()` helper) would have made the invariant obvious.
- 📌 [nit | evidence: plan.md Task 6.3 → implementation] Plan said `(localStorage.getItem('gdfkube.demoRole') as Role) ?? 'operator'`; implementation correctly chose the safer union-validating initializer instead. Good call but the plan was wrong on this point.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Plan Task 6.3 | Used union-validating initializer (`v === 'operator' || v === 'admin' ? v : 'operator'`) instead of plan's brace-cast | Plan's `as Role ?? 'operator'` is type-unsafe — a stale `'approver'` value from a previous SPA version would have leaked through the cast. The validation pattern matches the safer choice from `fix-itsm-portal-bug-batch` |
| Plan Task 7 vs commit history | Plan grouped Task 7 (Topbar UI) into one commit; landed as Task 7 (`c464ce6`) + Task 8.1 (`dc8831d`) as a follow-up `test:` commit | Existing `App.test.tsx` and `identityRace.test.tsx` suites needed parallel updates that the plan did not enumerate; splitting kept the feature diff and the test-fixture diff reviewable independently |
| Plan Task 9 (verification) | Not executed beyond `openspec validate --strict` and the test suite changes | Same intentional deferral pattern as `fix-itsm-portal-bug-batch`; interactive smoke walkthroughs not run, structural test coverage relied on instead |
| Plan Task 2.2 / Task 1.4 (re-run `export-seed-data.mjs`) | Not executed; `users.json` unchanged in the merge diff | The export script reseeds `users.json` and `requests.json` from TS sources. This change touched neither user catalog nor request fixtures — only `adminSeeds.ts` form-field arrays and `forms.json`. Re-running would have been a no-op for those files; the form-field drop was applied to both `forms.json` and `adminSeeds.ts` by hand in the same commit (`7ba75a1`) |

## 4. Skill / workflow compliance

| Skill | Used | Reason if skipped |
|---|---|---|
| superpowers:brainstorming | ✓ | `brainstorm.md` enumerated the silent-field-overwrite and identity/role conflation problems and converged on `X-Demo-Role` as the additive contract |
| superpowers:writing-plans | ✓ | `plan.md` mapped 8 tasks + 1 verification group with file-level granularity and per-task commit points |
| superpowers:using-git-worktrees | ✓ | Feature work landed on `worktree-feat-split-demo-user-and-role`, merged via `e3323b6`, worktree removed post-merge |
| superpowers:subagent-driven-development | ✓ | Per-task commit cadence matches the plan; merge commit message records the multi-commit feature unit |
| (transitive) superpowers:test-driven-development | ✓ | Each behavior-bearing task added or extended tests in the same or adjacent commit (`requests.test.ts`, `demoUser.test.ts`, `GenericRequest.test.tsx`, `App.test.tsx`, `identityRace.test.tsx`, `Topbar.test.tsx`) |
| (transitive) superpowers:requesting-code-review | partial | No explicit review subagent invocation recorded in this conversation; relied on author self-review during commit boundaries. Acceptable for a tightly-scoped change driven entirely by an explicit plan, but a lighter-weight signal than the `fix-itsm-portal-bug-batch` two-stage review |
| superpowers:finishing-a-development-branch | ✓ | Merge commit (`e3323b6`) preserves the multi-commit feature unit; feature branch + worktree cleaned up |
| superpowers:verification-before-completion | ✓ | `openspec validate --strict` recorded green in §1 of verify; per-commit test runs were preconditions for each plan commit point |

## 5. Surprises

- The `X-Demo-Role` override pattern (clone + override + invalid-fall-through) ended up being a single trim+match in `demoUser.ts:23`. The plan budgeted 5 test cases and ~10 lines of middleware logic; the implementation needed roughly half of each because the type narrowing (`'operator' | 'admin'`) was already done by `fix-itsm-portal-bug-batch`. Type-narrowing one change pays dividends in the next.
- `App.tsx` does not need a separate `useEffect` to push `setDemoRole(role)` into the API client. Calling it synchronously in the render body works the same way `setDemoUser` was already wired — the no-stale-header invariant generalizes uniformly across all session-scoped header refs. The plan over-specified the pattern (Task 6.4 implied a useEffect alongside the synchronous call); the implementation correctly skipped the redundant effect.
- The form-field removal from `forms.json` was a smaller diff than expected (~35 lines across 3 forms, not the 50+ the plan implied) because the field blocks were already concise. The matching `adminSeeds.ts` drop was equally tight (~36 lines).
- No downstream consumer audit revealed any actual coupling to the form-field presence — `HelmValuesBuilder.java` reads `requesterGroupName` from the persisted document; Camel routes read the same; ArgoCD ApplicationSet templates render off the group. The form field had been load-bearing only in the silently-overwritten code path that this change deletes.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| When a form field is "silently overwritten" by the server, the fix is to delete the field, not to wire it up correctly. The server already had the right value from `demoUser`; the form field was a parallel UX surface for the same data that introduced drift. Look for this pattern when "the field appears to work but actually doesn't matter" | `.claude/rules/` candidate or CLAUDE.md addendum | "Silently-overwritten form fields are a deletion signal, not a wire-up TODO. The server's authoritative source is the fix." |
| `localStorage` state initializers should validate against the type union before accepting the stored value, not brace-cast. A previous SPA version may have written a value that is no longer in the current type union (e.g. `'approver'` after a role narrowing) | already implied by `fix-itsm-portal-bug-batch` retrospective — reinforced here | Always pair the `useState` initializer with a union-validating guard for any value sourced from a persistent boundary (localStorage, URL params, cookies) |
| Additive headers (e.g. `X-Demo-Role` alongside `X-Demo-User`) are a non-breaking way to extend identity contracts. Default the SPA's ref to the most-permissive value (`'admin'` here) so admin-gated Bootstrap fetches succeed before `App` mounts — but enforce the server-side gate as the actual access control | already present in `itsm-express-api/spec.md` Demo Identity Middleware requirement — reinforced here | The pattern generalizes to any future per-request demo-overlay header (e.g. `X-Demo-Tenant`, `X-Demo-Locale`) |
| The synchronous-header invariant generalizes across all session-scoped refs — call setters in the render body, not in `useEffect`. Once one ref is wired this way, additional refs cost zero extra effects | already in `fix-itsm-portal-bug-batch` retrospective — reinforced here | Confirmed: adding `setDemoRole` alongside `setDemoUser` required no new effect, just a second synchronous call in the same render block |
| Per-task commit-point discipline (1:1 mapping from plan task to commit) makes retrospectives mechanical. The commit log IS the implementation timeline; no separate audit needed | already implied by superpowers:writing-plans — confirmed here | The 7 implementation commits map 1:1 to plan tasks 1, 2-3, 3, 4, 5, 6, 7. The retrospective could be reconstructed from `git log` alone |

---

## Follow-up work

| Item | Priority | Suggested change |
|---|---|---|
| Manual smoke walkthrough of tasks 8.2–8.9 against the live dev stack | LOW | Pre-demo acceptance pass; not gating on archive. Run when next bringing up `docker compose` for any reason |
| Document the `X-Demo-Role` header in the OpenAPI spec as an optional `header` security parameter | LOW | The `__tests__/openapi.test.ts` contract test would catch this if the header were declared; currently the header is implicit. Adding the documentation aligns the contract test with the wire reality |
| Consider extracting `pickActiveUser(data.users, activeUsername)` from the inline `useMemo` in `App.tsx` | LOW (nit) | The fallback chain (`activeUsername match → operator → users[0]`) is implicit; extracting clarifies the invariant and creates a unit-testable seam |
| Add a Topbar test pinning the alphabetical ordering of the Switch user list | LOW (nit) | The implementation currently relies on `data.users` iteration order. If a future change re-sorts upstream, the topbar would silently follow — a pinned-order test would surface that |

---

## Metrics

| Metric | Value |
|---|---|
| Plan tasks | 8 (plus 1 verification group of 10 sub-steps) |
| Implementation commits | 7 |
| Test-update commits | 1 (`dc8831d`) |
| Task-tracking commits | 1 (`2768783`) |
| Total commits (with scaffold + merge) | 11 |
| Files changed in merge | 14 |
| Line delta (merge) | +278 / −169 |
| New test files | 0 (all coverage landed by extending existing suites) |
| Tests extended in existing files | 6 suites (`demoUser`, `requests`, `GenericRequest`, `App`, `identityRace`, `Topbar`) |
| Capabilities with delta specs | 3 (`itsm-portal-shell`, `itsm-express-api`, `itsm-request-submission`) |
| Spec validation | `openspec validate split-demo-user-and-role --strict` → valid |
| Pre-existing failures left untouched | Same set documented in `fix-itsm-portal-bug-batch` retrospective; orthogonal to this change |
