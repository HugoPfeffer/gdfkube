## Design Summary

The `/review-team` audit of the not-yet-archived `add-gitea-settings` change surfaced four blocking defects, three smaller defects, and one spec inaccuracy. This change ships all of them in a single PR rather than a chain of small follow-ups, because the four blockers are interlocked (seed corruption blocks the verification step that would have caught the auth-bypass; the auth-bypass blocks the audit trail the feature exists to provide; missing tests block re-detection of any of the above). Splitting them would force callers to reason about half-broken intermediate states.

## Alternatives Considered

### Option A: One bundled fix PR (chosen)
- **Approach**: Land all four blockers, all smaller fixes, and the spec amendment in a single change `fix-gitea-settings-review`.
- **Pros**: Verification (`docker compose up` smoke test) only has to run once; reviewers see the full corrective scope; no intermediate broken states; matches the user's stated preference for bundled refactors in this area.
- **Cons**: Larger diff than any individual fix; one rollback reverts everything.
- **Why chosen**: The four blockers are causally linked — fixing the seed shape is what makes the auth-bypass fix testable, and the new backend tests are what prevent regressing the seed shape. A chain of small PRs would interleave broken `main` states.

### Option B: Amend the original `add-gitea-settings` change
- **Approach**: Reopen `add-gitea-settings`, edit its tasks.md/spec.md/plan.md, recheck items.
- **Pros**: No new OpenSpec change to manage; history shows one cohesive feature delivery.
- **Cons**: Loses the audit trail from `/review-team` (the reviewers' findings disappear into "v2"); breaks the OpenSpec rule that completed task checkboxes reflect verified work — flipping them back to unchecked would mask that they were prematurely checked.
- **Why not chosen**: The premature-completion signal is itself valuable; future audits should be able to see "the feature was claimed done, here are the things that turned out to be wrong." A separate corrective change preserves that.

### Option C: Split into per-blocker PRs (seed-fix, auth-fix, tests-add, smaller-fixes)
- **Approach**: Four sequenced changes, each landing one blocker.
- **Pros**: Smaller, easier-to-review individual PRs; bisect-friendly.
- **Cons**: Between the seed-fix PR landing and the auth-bypass-fix PR landing, the SPA's Settings page would still hard-code `maria.costa` against a now-correct seed — a working-but-wrong state. Tests-added-last means each prior PR ships unverified. Six PR cycles vs one.
- **Why not chosen**: The interlock between blockers (seed → auth → tests → spec) means splitting buys nothing reviewable, and costs verification cycles.

## Agreed Approach

Option A. Bundle the corrective scope into one new OpenSpec change `fix-gitea-settings-review`. Land it before archiving `add-gitea-settings` so the archive captures the corrected state. The plan file at `.claude/plans/polished-jumping-corbato.md` already enumerates the concrete diffs; this change wraps that work in the proposal/specs/tasks/plan artifacts so the archived record is consistent with the rest of the repo's OpenSpec history.

## Key Decisions

- **Settings page routes through `itsmApi`, not raw `fetch`.** The hard-coded `X-Demo-User: maria.costa` is replaced by the existing `demoUserResolver` wiring at `App.tsx:83–85` so the audit trail (`updatedBy`) reflects whichever admin actually saved. This is the canonical pattern for every other SPA call and the deviation in Settings was the original review finding.
- **Seed export must preserve source-of-truth shape.** `username` is load-bearing for `App.tsx::pickUser`; numeric `users/forms/clusters` on groups are load-bearing for `Users.tsx` rendering. The export script's transformation logic is reverted to a pure projection — it MUST NOT drop fields or coerce types.
- **Backend tests mirror `groups.test.ts` layout.** Ten scenarios covering admin GET (redacted + reveal), non-admin 403, missing-doc 404, PATCH validation matrix (valid, bad URL, bad owner, empty token, null body), and non-admin PATCH 403. DB cleanup uses the existing global `vitest.setup.ts` — no new test harness.
- **Spec amends, not code workarounds.** The original spec required reusing `src/forms/validate.ts`. The challenger confirmed that helper expects dynamic `Field` objects from the form-builder, not three static inputs. Synthesizing fake `Field`s would be a worse pattern than two inline regex constants. Amend the spec to require regex constants matching the server-side `match` validators instead.
- **`Cache-Control: no-store` on `?reveal=1`.** The plaintext-PAT response path gets a no-store header to prevent intermediate caching. Not strictly required by the spec but a free defense-in-depth on a route that returns secret material.
- **Out of scope:** real auth (demo pattern, called out by compliance reviewer but not a regression introduced here), encryption-at-rest for the PAT (accepted risk in original `design.md`), optimistic-concurrency `If-Match` on PATCH (low-priority demo-grade gap), Vault/K8s Secret integration (explicit non-goal).

## Open Questions

None. Plan is concrete enough to implement directly.
