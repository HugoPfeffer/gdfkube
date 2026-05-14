# Fix ITSM Admin Save Paths Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Close eight admin-save defects (M-5 / M-6 / M-7 / M-8 / M-9 / M-19 /
M-20 / M-21) by trimming the Group PATCH whitelist, surfacing create
failures, capturing server responses end-to-end, and tightening tests.

**Architecture:** Two-tier change — Express server (`groupAdminService.ts`
whitelist + tests) and the React SPA (UserEditor / GroupEditor / NewUserPage /
NewFormPage / NewGroupPage / App.tsx / itsmApi.ts + tests). No DB migration;
storage of `Group.users / forms / clusters` remains; only the write path is
closed.

**Tech Stack:** TypeScript, React, Express, Mongoose, Vitest, supertest.

**Sequencing note:** This plan is blocked by `fix-admin-id-field-mismatch`
(touches the same `NewUserPage` / `NewGroupPage` create bodies). Apply that
change before starting Task 5/Task 6 here, or rebase after.

---

## Task 1: Server — trim Group PATCH whitelist (M-6)

- [ ] **Step 1.1:** Open `gdfkube-src/gdfkube-itsm/server/src/services/groupAdminService.ts` and locate `PATCH_WHITELIST` (lines 4-11).
- [ ] **Step 1.2:** Trim the Set literal to exactly `['name', 'fullName', 'repo']`. Leave the rest of the file unchanged.
- [ ] **Step 1.3:** Run `cd gdfkube-src/gdfkube-itsm/server && npm test -- --runInBand groups` and capture failures. Expected: tests that PATCH `users`/`forms`/`clusters` will fail with 400 instead of 200 — that's the signal to update them in Task 2.
- [ ] **Step 1.4:** Commit checkpoint: `server: trim group PATCH whitelist to {name,fullName,repo} (M-6)`.

## Task 2: Server — Groups whitelist tests (red → green)

- [ ] **Step 2.1:** Open `gdfkube-src/gdfkube-itsm/server/__tests__/groups.test.ts`. Identify any case that PATCHes `users`/`forms`/`clusters` and asserts success — either delete or invert to assert `400 Bad Request` with body `{ "error": /Invalid field/ }`.
- [ ] **Step 2.2:** Add a positive case (red first): `PATCH /api/itsm/groups/saude` with `{ name: 'Saúde', fullName: 'Secretaria da Saúde', repo: 'gdfkube-saude' }` → `200` and document reflects values.
- [ ] **Step 2.3:** Add negative cases: `PATCH { users: [] }` → 400; `PATCH { forms: [] }` → 400; `PATCH { clusters: [] }` → 400; `PATCH { foo: 1 }` → 400.
- [ ] **Step 2.4:** Run `npm test -- groups` until green.
- [ ] **Step 2.5:** Commit checkpoint: `server: lock groups PATCH whitelist via tests (M-6, M-9)`.

## Task 3: Server — Users whitelist completeness tests (M-21)

- [ ] **Step 3.1:** Open `gdfkube-src/gdfkube-itsm/server/__tests__/users.test.ts` lines 119-126.
- [ ] **Step 3.2:** Add (red first) `PATCH /api/itsm/users/<seed-user>` with `{ username: 'new.name' }` → 200, document.username updated.
- [ ] **Step 3.3:** Add `PATCH { active: false }` → 200, document.active === false.
- [ ] **Step 3.4:** Add negative `PATCH { foo: 1 }` → 400 (if not already covered).
- [ ] **Step 3.5:** Run `npm test -- users` until green.
- [ ] **Step 3.6:** Commit checkpoint: `server: cover username and active whitelist entries (M-21)`.

## Task 4: SPA — UserEditor sends fullName and active (M-5)

- [ ] **Step 4.1:** Write the failing test first. In `gdfkube-src/gdfkube-itsm/src/admin/__tests__/UserEditor.test.tsx`, add a case: render the editor for a seeded user, type into the Full name input, click Save, assert the mocked `itsmApi.users.update` was called with a body that includes `fullName: <new value>`.
- [ ] **Step 4.2:** Add a second case: toggle the status radio to `disabled`, click Save, assert the body includes `active: false` and `status: 'disabled'`.
- [ ] **Step 4.3:** Run `cd gdfkube-src/gdfkube-itsm && npm test -- UserEditor` — confirm both new cases fail.
- [ ] **Step 4.4:** Open `gdfkube-src/gdfkube-itsm/src/admin/UserEditor.tsx`. In `handleSave` (lines 95-125), add to the `changes` object:
  ```ts
  fullName: user.fullName ?? user.name,
  active: (user.status ?? 'active') === 'active',
  ```
- [ ] **Step 4.5:** In the `isDirty` predicate (lines 83-90), include a comparison on `fullName` so the Save button enables when only that field is edited.
- [ ] **Step 4.6:** Re-run tests until green.
- [ ] **Step 4.7:** Commit checkpoint: `itsm: UserEditor sends fullName and active on Save (M-5)`.

## Task 5: SPA — editors capture server response (M-8)

- [ ] **Step 5.1:** Write a failing test in `UserEditor.test.tsx`: mock `itsmApi.users.update` to resolve with a server-normalized doc (e.g. trimmed `fullName`), click Save, assert the reducer dispatch is `{ type: 'UPDATE_USER', id, patch: <server-doc> }` and `setSaved` reflects the spread.
- [ ] **Step 5.2:** Update `UserEditor.tsx` (lines 107-108):
  ```ts
  const updated = await itsmApi.users.update(user.id, changes);
  dispatch({ type: 'UPDATE_USER', id: user.id, patch: updated as Partial<User> });
  setSaved({ ...user, ...updated });
  ```
- [ ] **Step 5.3:** Apply the same pattern in `GroupEditor.tsx` (lines 43-44), using `UPDATE_GROUP` and `Partial<Group>`. Add a mirror test in `GroupEditor.test.tsx`.
- [ ] **Step 5.4:** Run editor tests until green.
- [ ] **Step 5.5:** Commit checkpoint: `itsm: editors capture server Save response (M-8)`.

## Task 6: SPA — exact PATCH body assertions (M-9)

- [ ] **Step 6.1:** In `gdfkube-src/gdfkube-itsm/src/admin/__tests__/GroupEditor.test.tsx:100`, replace `expect(...).toHaveBeenCalledWith(<id>, expect.objectContaining({ name }))` with an exact body match for `{ name, fullName, repo }`.
- [ ] **Step 6.2:** Re-run `GroupEditor` tests; the assertion is tightened — adjust the test scenario inputs so the expected object is correct.
- [ ] **Step 6.3:** Commit checkpoint: `itsm: assert exact GroupEditor PATCH body shape (M-9)`.

## Task 7: SPA — thread setToast through NewUserPage and NewFormPage (M-7)

- [ ] **Step 7.1:** Read `App.tsx` to confirm `setToast` is currently passed to `NewGroupPage` only.
- [ ] **Step 7.2:** Update the route render block in `App.tsx` to also pass `setToast` to `NewUserPage` and `NewFormPage`.
- [ ] **Step 7.3:** Update the prop signatures of `NewUserPage` and `NewFormPage` to accept `setToast?: (t: Toast) => void`.
- [ ] **Step 7.4:** Write failing tests:
  - `NewUserPage.test.tsx`: mock `itsmApi.users.create` to reject, click Create, assert `setToast` is invoked with `variant: 'error'`.
  - `NewFormPage.test.tsx`: same shape.
- [ ] **Step 7.5:** Replace `catch { setIsSaving(false); }` in `NewUserPage.tsx:76-78` with the `NewGroupPage.tsx:69-77` shape (error toast + clear flag). Repeat for `NewFormPage.tsx:86-87`.
- [ ] **Step 7.6:** Run tests until green.
- [ ] **Step 7.7:** Commit checkpoint: `itsm: surface NewUserPage and NewFormPage create failures via toast (M-7)`.

## Task 8: SPA — NewGroupPage uses server response as-is (M-19)

- [ ] **Step 8.1:** Open `gdfkube-src/gdfkube-itsm/src/admin/NewGroupPage.tsx` lines 51-61.
- [ ] **Step 8.2:** Replace the `created.<field> ?? local.<field>` fallback chain with the server response directly. Dispatch `ADD_GROUP` with the response verbatim.
- [ ] **Step 8.3:** Update / add a test in `NewGroupPage.test.tsx`: mock create to return a server doc missing a field, assert the dispatch contains the response verbatim (no local merge).
- [ ] **Step 8.4:** Run tests until green.
- [ ] **Step 8.5:** Commit checkpoint: `itsm: trust server response on group create, no local fallback (M-19)`.

## Task 9: SPA — itsmApi captures non-JSON 5xx bodies (M-20)

- [ ] **Step 9.1:** Open `gdfkube-src/gdfkube-itsm/src/api/itsmApi.ts` lines 64-77.
- [ ] **Step 9.2:** Wrap `response.json()` in try/catch. On parse failure, do:
  ```ts
  let raw = '';
  try { raw = await response.text(); } catch { /* ignore */ }
  const tail = raw.slice(0, 200);
  throw new Error(`${response.status} ${response.statusText}${tail ? ` — ${tail}` : ''}`);
  ```
- [ ] **Step 9.3:** Add focused tests using a fetch mock that returns 500 with: (a) valid JSON `{error}`, (b) HTML body, (c) empty body. Assert the thrown error message contains the relevant fragment in each case.
- [ ] **Step 9.4:** Run tests until green.
- [ ] **Step 9.5:** Commit checkpoint: `itsm: include non-JSON 5xx bodies in thrown API errors (M-20)`.

## Task 10: Verification

- [ ] **Step 10.1:** `cd gdfkube-src/gdfkube-itsm && npm test` — all green.
- [ ] **Step 10.2:** `cd gdfkube-src/gdfkube-itsm/server && npm test` — all green.
- [ ] **Step 10.3:** Manual: start the dev stack, edit a user's Full name → Save → re-bootstrap → name persists.
- [ ] **Step 10.4:** Manual: stop the Express server → submit on New User page → expect "Create failed" toast.
- [ ] **Step 10.5:** Manual: `curl -X PATCH http://localhost:8080/api/itsm/groups/saude -H "X-Demo-User: maria.costa" -H "Content-Type: application/json" -d '{"users":5}'` → `400 Bad Request`.
- [ ] **Step 10.6:** `pre-commit run --all-files` — green.
- [ ] **Step 10.7:** Update `verify.md` with the evidence above and run `openspec verify "fix-itsm-admin-save-paths"`.
