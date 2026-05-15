# Retrospective: auto-slug-group-form-ids

> Written: 2026-05-14 (after verify passed with warnings)
> Commit range: `9ce64c0..0960b06`
> Worktree: merged to main

---

## 1. Wins

- [evidence: `gdfkube-src/gdfkube-itsm/src/utils/slug.ts`, `src/utils/__tests__/slug.test.ts`] Single zero-dependency `slugify` utility with `SLUG_REGEX` covers diacritic folding, run-collapse, trim, empty input, and idempotence — exactly the contract the spec requires.
- [evidence: commit 9ce64c0, `NewGroupPage.tsx` / `NewFormPage.tsx`] Both create pages now render the ID input as `disabled readOnly` and derive it live from Display name, restoring parity with the already-read-only `GroupEditor`.
- [evidence: `NewGroupPage.test.tsx`, `NewFormPage.test.tsx`] Existing tests were rewritten to drive Display name and assert on the read-only ID input as output, preserving the form-id collision case and adding empty-slug + diacritic cases.
- [evidence: commit 0960b06] `setToast` wiring on `GroupEditor` and `NewGroupPage` caught and fixed in the same change window — no follow-up needed.

## 2. Misses

- 🟡 [painful  | evidence: tasks.md 6.3 still `- [ ]`] Manual SPA dev-server smoke (Min. da fazenda / Educação / `...` / form collision) was skipped in favor of the Vitest component coverage. Acceptable trade-off for a pure-derivation UI change, but it leaves the in-browser focus/blur and IME paths unexercised.
- 📌 [nit      | evidence: `proposal.md` "Impact › Server"] Server-side `SLUG_REGEX` enforcement was deferred. Worth a follow-up change so a malformed `_id` from a non-SPA client can't bypass the SPA's guarantee.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 6.3 | Skipped manual dev-server smoke; relied on component tests instead | Behavior is pure derivation of input → derived value; component tests assert the same scenarios. Flagged as a non-blocking miss. |
| (extra) | Added `setToast` wiring fixes on `GroupEditor` + `NewGroupPage` (commit 0960b06) | Toast plumbing regressed alongside the form rewrite; cheaper to fix in the same window than open a separate change. |

## 4. Skill / workflow compliance

| Skill                                            | Used | Reason if skipped |
|--------------------------------------------------|------|-------------------|
| superpowers:brainstorming                        | yes  | `brainstorm.md` produced before proposal |
| superpowers:writing-plans                        | yes  | `plan.md` task-by-task with explicit step bodies |
| superpowers:using-git-worktrees                  | no   | Solo developer; worked directly on `main` per `CLAUDE.md` workflow |
| superpowers:subagent-driven-development          | no   | Plan was small (≤7 task groups, single SPA package); executed inline |
| (transitive) superpowers:test-driven-development | yes  | `slug.test.ts` written alongside `slug.ts`; component tests updated before page rewrites passed |
| (transitive) superpowers:requesting-code-review  | no   | Solo developer; no external reviewer in loop |
| superpowers:finishing-a-development-branch       | n/a  | Committed directly to `main` |

## 5. Surprises

- The existing `NewGroupPage.test.tsx` already had a "manual edit of Git repo persists" case; the rewrite needed an effect-based repo sync (`useEffect` watching derived `id`) rather than wiring repo into the deleted `onIdChange` — minor refactor, no spec drift.
- `setToast` not being wired through to `GroupEditor` and `NewGroupPage` was a latent regression noticed only while smoke-testing the read-only ID input; folded into 0960b06.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| Admin "create" forms in this SPA derive their resource ID read-only from Display name via `slugify` — never expose the ID input as editable. | `CLAUDE.md` (Demo identity / Coding Standards) | Once `itsm-admin-slug-id` is synced to `openspec/specs/`, the rule is also captured there; a one-line CLAUDE.md note keeps it discoverable to future sessions. |
| Server-side `SLUG_REGEX` enforcement on `POST /api/itsm/groups` and `POST /api/itsm/forms` | New OpenSpec change | Defense-in-depth follow-up explicitly deferred in `proposal.md`. |
| Manual SPA smoke step (6.3) is low-value when the behavior is pure input → derived-output and is covered by component tests; consider downgrading to "skip when fully covered by Vitest" in future plans. | Plan-writing convention | — |
