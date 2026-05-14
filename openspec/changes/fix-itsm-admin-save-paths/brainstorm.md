## Design Summary

A cluster of ITSM admin Save-flow inconsistencies, all rooted in the same class
of defect — write paths that drop data, swallow errors, or ignore the server's
response. The fix is to close eight specific gaps (M-5, M-6, M-7, M-8, M-9,
M-19, M-20, M-21 from the unified audit findings) without expanding scope into
the open investigations (M-22, M-23) or low-priority bootstrap robustness (L-12,
L-13).

The design hinges on one architectural decision: for the Group PATCH whitelist
drift (M-6), trim the server-side whitelist down to the fields the UI actually
sends (`name`, `fullName`, `repo`) rather than adding new UI inputs for the
unreachable fields (`users`, `forms`, `clusters`). This treats `users / forms /
clusters` as derived/computed state.

## Alternatives Considered

### Option A: Trim server whitelist to UI fields (chosen)

- **Approach**: Drop `users`, `forms`, `clusters` from `groupAdminService.ts`
  `PATCH_WHITELIST`. Resulting set: `{ name, fullName, repo }`. The Mongoose
  document still stores those fields; only the write path is closed. Existing
  tests that PATCH the dropped fields now assert 400.
- **Pros**:
  - Eliminates drift between server and UI — the surface area becomes exactly
    what the editor can produce.
  - No new UI affordance to design, test, or maintain.
  - Aligns with the project's "eliminate drift" principle (CLAUDE.md) and
    "modify existing functions over adding new ones".
  - Safe: storage stays intact, so a future derived-read endpoint can expose
    these fields without a migration.
- **Cons**:
  - Removes a (dead but technically present) capability. If a future feature
    needs to write `users` or `clusters` directly, the whitelist must be
    extended.
- **Why chosen**: Project values driftless code; dead permissions are a known
  drift trap.

### Option B: Add UI inputs for users / forms / clusters

- **Approach**: Extend `GroupEditor.tsx` with inputs (likely list editors or
  multi-selects) for the three fields the server already accepts.
- **Pros**:
  - Preserves the existing server contract.
  - Surfaces capability that currently exists but is unreachable.
- **Cons**:
  - Significantly larger scope — new UI, validation, and tests.
  - Risks shipping admin affordances without a clear demo need.
  - The plan author explicitly rejected this as a "drift trap" — the
    capability isn't requested by any demo flow.
- **Why not chosen**: Out of demo scope; expands rather than eliminates drift.

### Option C: Compute users / forms at read time, leave whitelist as-is

- **Approach**: Keep the server whitelist; have the read endpoint derive
  `users` and `forms` from related collections on each fetch.
- **Pros**:
  - Decouples derived data from manual writes.
- **Cons**:
  - Doesn't solve the whitelist drift on its own — the dead write path remains.
  - Pulls in a separate concern (derived reads) the plan flags as a follow-up.
- **Why not chosen**: Distinct concern; explicitly listed as out of scope in
  the input plan.

## Agreed Approach

**Option A.** Trim the Group PATCH whitelist to `{ name, fullName, repo }`. In
parallel, fix the seven other findings on the SPA/server save path:

1. UserEditor sends `fullName` and `active` on Save (M-5).
2. UserEditor and GroupEditor capture the server response and dispatch the
   server-normalized shape into the reducer (M-8).
3. NewUserPage and NewFormPage surface create failures via the existing
   `setToast` prop, matching NewGroupPage (M-7).
4. NewGroupPage uses the server response as-is post-create — drop the
   `created.* ?? local` fallback chain (M-19).
5. `itsmApi.ts` error path captures non-JSON 5xx bodies into the thrown error
   (M-20).
6. Tests assert exact PATCH body shape, cover `username` / `active` whitelist
   entries, and assert toast emission on create failure (M-9, M-21).

## Key Decisions

- **Option A over Option B** for the Group whitelist. Trim, don't expand.
- **No DB migration.** `Group.users / forms / clusters` storage stays; only
  the write path is closed.
- **Toast prop pattern stays.** Thread `setToast` through `NewUserPage` and
  `NewFormPage` rather than introducing a global toast system or refactor.
- **No fallback merges.** After create, the server response is authoritative;
  if a field is omitted, let the next refetch reconcile.
- **Out of scope, deferred:**
  - L-12 / L-13 (App.tsx bootstrap robustness) — Low severity, separate plan.
  - M-22 (`env=production` default) and M-23 (`saude` group fallback) — open
    investigations; do not auto-fix here.
  - Derived-read endpoint for `users / forms` — separate plan if needed.
- **Sequencing.** Blocked by `fix-admin-id-field-mismatch` (touches the same
  create bodies). Apply that change first to avoid a rebase.

## Open Questions

None blocking this change. Two flagged for follow-up plans (not this one):

- **M-22**: Does `GenericRequest.tsx`'s `env=production` default persist
  post-Express-API, and does it affect any real demo flow?
- **M-23**: Is the hard-coded `'saude'` group fallback in `GenericRequest.tsx`
  still reachable, or is it dead code from the pre-Express era?
