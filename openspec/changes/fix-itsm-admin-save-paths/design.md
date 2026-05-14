## Context

The ITSM SPA's admin Save flows have accumulated eight related defects on
the write path. They cluster into three concerns:

1. **Whitelist / body drift.** UserEditor's Save body omits `fullName` and
   `active` even though the server accepts them; GroupEditor's body sends
   only `{ name, fullName, repo }` while the server's PATCH whitelist allows
   `users / forms / clusters` as well. The two ends of the contract drift
   in opposite directions.
2. **Silent failure surface.** NewUserPage and NewFormPage's catch blocks
   reset the saving flag and produce no UI feedback. `itsmApi.ts` discards
   non-JSON 5xx response bodies. NewGroupPage's post-create reducer falls
   back to local guesses when the server omits fields.
3. **Test gaps.** `GroupEditor.test.tsx` uses `objectContaining({ name })`
   which lets extra keys slip through; `server/__tests__/users.test.ts`
   does not exercise the `username` / `active` whitelist entries.

Current state was verified on 2026-05-14 against the source paths cited
in the input plan (`gdfkube-itsm/src/admin/UserEditor.tsx:95-125`,
`gdfkube-itsm/server/src/services/groupAdminService.ts:4-11`, etc.).

**Constraints** (from `CLAUDE.md`):
- Prefer modifying existing functions/services over creating new ones.
- Eliminate drift between source-of-truth and consumers.
- Demo identity: `DEMO_USERS` is the source of truth; no frontend fallback
  arrays.

**Stakeholders:** solo developer (Hugo Pfeffer). No external dependencies.

## Goals / Non-Goals

**Goals:**
- Close M-5 / M-6 / M-7 / M-8 / M-9 / M-19 / M-20 / M-21.
- Make the admin save contract symmetric: server accepts exactly what the
  UI can send; UI persists exactly what the user can edit.
- Surface every create / update failure in the UI; never swallow.
- Tests assert exact PATCH body shape and toast-on-failure behavior.

**Non-Goals:**
- L-12 / L-13 (App.tsx bootstrap robustness — `setDemoUser` fallback,
  `users[0]!` assertion). Low severity; separate plan.
- M-22 (`env=production` default in `GenericRequest.tsx:97`) — open
  investigation; do not silently change.
- M-23 (hard-coded `'saude'` group fallback in `GenericRequest.tsx`) — may
  be dead post-Express-API; investigate separately.
- A Mongoose schema migration for `Group.users / forms / clusters` — those
  fields remain on the document; only the *write path* is closed.
- A derived-read endpoint that computes `users / forms` from related
  collections — separate plan if needed.
- A global toast-system refactor — the existing `setToast` prop pattern is
  fine.

## Decisions

### D1. Option A for the Group whitelist drift (M-6)

**Decision:** drop `users`, `forms`, `clusters` from
`groupAdminService.ts`'s `PATCH_WHITELIST`. Final set: `{ name, fullName,
repo }`.

**Alternatives:**
- **B. Add UI inputs for `users / forms / clusters`.** Rejected as a drift
  trap — adds admin surface area no demo flow needs, and inflates test
  matrix.
- **C. Compute `users / forms` server-side at read time.** Solves a
  different problem (read derivation); leaves the dead write path open.
  Tracked as a follow-up plan if needed.

**Rationale:** Option A removes drift in the smallest possible diff (one
service file, one test file). Storage is preserved; a future read-side or
write-side feature can re-introduce the keys deliberately rather than
inherit them by accident.

### D2. Capture the server response in editors (M-8)

**Decision:**
```ts
const updated = await itsmApi.<entity>.update(id, changes);
dispatch({ type: 'UPDATE_<ENTITY>', id, patch: updated as Partial<T> });
setSaved({ ...local, ...updated });
```

**Alternatives:**
- **Refetch after save.** Heavier — double round-trip and extra cache
  reconciliation when the server already returns the normalized doc.
- **Trust local state.** Status quo — the bug we're fixing.

**Rationale:** Server-side normalization (trim, role enum constraints)
should propagate to the reducer. Spreading `local` then `updated`
preserves any local-only UI state while letting the server be
authoritative for persisted fields.

### D3. Drop the `created.* ?? local` fallback in NewGroupPage (M-19)

**Decision:** use the server response as-is for the reducer dispatch.

**Alternatives:**
- **Keep the fallback chain.** Status quo — silently masks server bugs.
- **Refetch after create.** Heavier; not justified for a create where the
  server already returns the new doc.

**Rationale:** Fail loudly. If the server omits a field, the next
`Bootstrap` refresh reconciles. Aligns with CLAUDE.md's "fail hard, don't
paper over" stance on Bootstrap fallbacks.

### D4. Thread `setToast` to NewUserPage and NewFormPage (M-7)

**Decision:** Follow `NewGroupPage`'s pattern. `App.tsx` already owns the
toast state and passes `setToast` to `NewGroupPage`; extend the prop to
the other two create pages.

**Alternatives:**
- **Context-based toast.** Larger refactor for marginal gain at this
  scale.
- **Per-page local error banner.** Inconsistent with the rest of the
  admin shell.

**Rationale:** Smallest-diff, pattern-consistent fix. No new abstraction.

### D5. Capture non-JSON 5xx bodies in `itsmApi.ts` (M-20)

**Decision:** wrap `response.json()` in try/catch; on parse failure,
`await response.text()` and append the raw text to the thrown error
message (capped to a sensible length to avoid leaking HTML stack traces
into toasts).

**Alternatives:**
- **Always read as text first, parse second.** Adds latency for the happy
  path; the current shape works.
- **Custom error classes.** Larger surface; not justified by the
  immediate need.

**Rationale:** Backwards-compatible with all callers; only changes the
content of `error.message` on parse failures.

### D6. Test tightening (M-9, M-21)

**Decision:**
- Replace `objectContaining({ name })` with the exact body shape
  `{ name, fullName, repo }` in `GroupEditor.test.tsx`.
- Add positive (`PATCH { username }`, `PATCH { active }`) and negative
  (`PATCH { users: 5 } → 400`) cases on the server tests.

**Rationale:** Future drift between editor and whitelist will be caught at
PR time rather than at demo time.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Whitelist trim breaks an upstream consumer that PATCHes `users / forms / clusters` directly. | Search for any direct callers (`grep -r "groups.update" gdfkube-itsm/`); none expected outside `GroupEditor.tsx`. The fix is reversible — re-add the key to the whitelist. |
| `setSaved({ ...local, ...updated })` masks a field the server intentionally removes. | If the server sets a field to `null`/`undefined`, the spread preserves it. Acceptable because the server's contract is "return the persisted doc"; if it returns `null` we surface `null`. |
| Threading `setToast` to two new pages introduces a prop-drilling smell. | Already the established pattern in this codebase; refactoring to context is out of scope and would itself be a drift event. |
| `await response.text()` in the error path could leak HTML/stack traces into the user-facing toast. | Cap appended text to ~200 chars; the toast message already shows the status code first. |
| `created.* ?? local` removal exposes any silent server bug as a missing field in the UI. | This is the *intended* effect — fail loudly. Bootstrap's next refresh reconciles. |
| Tests asserting exact body shape become brittle if a future spec adds a field. | Acceptable: a new field is a deliberate change, and the test break is the signal. |

## Migration Plan

Single-commit (or small-PR) rollout:

1. Apply server changes first (whitelist trim + server tests) — this is
   the only change that affects API contract. Verify
   `cd gdfkube-itsm/server && npm test`.
2. Apply SPA changes (UserEditor, GroupEditor, NewUserPage, NewFormPage,
   NewGroupPage, App.tsx, itsmApi.ts) + SPA tests.
3. Run `cd gdfkube-itsm && npm test` — green.
4. Manual smoke:
   - Edit a user's Full name → Save → re-bootstrap → name persists.
   - Stop the server → `NewUserPage` create → "Create failed" toast.
   - `curl PATCH /api/itsm/groups/<id> -d '{"users":5}'` → 400.

**Rollback:** revert the change set. No data migration. The trimmed
fields remain on the Mongoose document, so a revert restores the prior
write surface without state loss.

**Sequencing:** `fix-admin-id-field-mismatch` ships first (touches the
same create bodies in `NewUserPage` / `NewGroupPage`).
